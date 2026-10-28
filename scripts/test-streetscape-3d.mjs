import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.STREETSCAPE_TEST_OUT??'output/browser/streetscape/integration';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--use-angle=metal']});
const report={base:process.env.GAME_URL??'http://127.0.0.1:5173',frames:[],stability:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await page.routeWebSocket(/.*/,socket=>socket.send(JSON.stringify({type:'connected'})));
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>window.__sceneryFreeze?0:raf(t=>{if(!window.__sceneryFreeze)fn(t)})});
 await page.goto(`${report.base}/?picture=clean`);
 await page.waitForFunction(()=>window.soraCars&&document.fonts.status==='loaded');
 await page.waitForFunction(()=>{const d=document.querySelector('#race-canvas')?.dataset;return ['carAsset','sceneryAsset','lightingAsset','understoryAsset'].every(k=>d?.[k]==='detailed')},null,{timeout:90000});
 report.setup=await page.evaluate(async()=>{
  window.advanceTime(0);window.__sceneryFreeze=true;
  const loaded=path=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===path).at(-1)?.name??path;
  const [worldModule,arcadeModule,streetModule,assets,engine,session,driver,THREE,cityBlocks]=await Promise.all([
   import(loaded('/src/game/three/world.ts')),import(loaded('/src/game/renderer.ts')),import(loaded('/src/game/street/renderer.ts')),
   import(loaded('/src/game/street/assets.ts')),import(loaded('/src/game/engine.ts')),import(loaded('/src/game/street/session.ts')),
   import(loaded('/src/game/street/test-driver.ts')),import('/node_modules/three/build/three.module.js'),import(loaded('/src/game/three/city-blocks.ts'))]);
  const {bundle}=await assets.loadStreetRoute('tokyo-1986'),canvas=document.querySelector('#race-canvas'),world=worldModule.getRaceWorld(canvas);
  const arcadeRenderer=new arcadeModule.RaceRenderer(canvas),streetRenderer=new streetModule.StreetRaceRenderer(canvas);
  const nativeStreet=new session.StreetRaceSession(bundle),nativeArcade=engine.createRace(0,8),fixtures=[];
  const capture=(mode,values,targets,boundaries)=>{
   let before=structuredClone(values());const pending=new Set(targets),pendingBoundaries=new Set(boundaries),rows=[];
   while(pending.size||pendingBoundaries.size){
    const prior=structuredClone(values());let row;
    if(mode==='street'){row=prior.cars.map((_,i)=>driver.streetDriver(bundle.track,prior,i));nativeStreet.step(row)}
    else{row=prior.cars.map((_,i)=>engine.botControl(prior,i));engine.stepRace(nativeArcade,row)}
    rows.push(row);const current=values(),progress=mode==='street'?current.cars[0].progressMm/1000:current.cars[6].progress/1000;
    for(const target of pending)if(progress>=target){fixtures.push({mode,label:`${mode}-${target}m`,state:structuredClone(current),controls:row[mode==='street'?0:6],target,progress});pending.delete(target)}
    for(const boundary of pendingBoundaries)if(progress>=boundary){fixtures.push({mode,label:`${mode}-boundary-${boundary}-before`,state:prior,controls:row[mode==='street'?0:6],boundary,part:'before'});fixtures.push({mode,label:`${mode}-boundary-${boundary}-after`,state:structuredClone(current),controls:row[mode==='street'?0:6],boundary,part:'after'});pendingBoundaries.delete(boundary)}
    before=current;if(current.tick>4000)throw new Error(`${mode} native driver failed to reach targets`);
   }
   return {ticks:before.tick,actions:rows,terminalProgress:mode==='street'?before.cars[0].progressMm:before.cars[6].progress};
  };
  const nativeRuns={street:capture('street',()=>nativeStreet.state,[35,175,435],[20,160,440]),arcade:capture('arcade',()=>nativeArcade,[120,230,310,790,860,940],[280,840])};
  const options={street:{playerSlot:0,names:Array.from({length:8},(_,i)=>i===0?'YOU':`DRIVER ${i+1}`),objects:bundle.objects,hud:true,presentationTitles:false},arcade:{playerSlot:6,names:Array.from({length:8},(_,i)=>i===6?'YOU':`DRIVER ${i+1}`),skins:Array.from({length:8},(_,i)=>i%6),hud:true,countdown:-1}};
  const draw=(fixture,camera='chase')=>{
   const snapshot=structuredClone(fixture.state),before=JSON.stringify(snapshot),trackBefore=JSON.stringify(bundle.track);
   if(fixture.mode==='street')streetRenderer.draw(bundle.track,snapshot,{...options.street,controls:fixture.controls,rain:snapshot.rain,camera},snapshot.tick/30);
   else arcadeRenderer.draw(snapshot,{...options.arcade,controls:fixture.controls,camera},snapshot.tick/30);
   if(JSON.stringify(snapshot)!==before||JSON.stringify(bundle.track)!==trackBefore)throw new Error('Presentation mutated native checkpoint or track');
   world.scene.updateMatrixWorld(true);
  };
  const plotSnapshot=fixture=>{
   const batch=world.cityPlotBatch,layout=world.cityPlotLayout,stats=batch.group.userData.cityPlotStats;
   const ids=stats.ids.slice(),selected=layout?.plots.filter(p=>ids.includes(p.id))??[],geometry={},emissionErrors=[];
   const progress=fixture.mode==='street'?fixture.state.cars[0].progressMm/1000:fixture.state.cars[6].progress/1000;
   const active=world.cityLayout?cityBlocks.selectCityBlocks(world.cityLayout,progress):{buildings:[],apartments:[]};
   const buildingIds=new Set([...active.buildings,...active.apartments].map(p=>p.id));
   const expectedIds=(layout?.plots.filter(p=>buildingIds.has(p.buildingId)).map(p=>p.id)??[]).sort();
   // Fingerprint each retained plot's ACTUAL emitted attribute slice, not only
   // the source cache or layout. Merging may move the slice offset at a cell.
   const hash=(attribute,start,count)=>{
    const array=attribute.array,bytes=new Uint8Array(array.buffer,array.byteOffset+start*attribute.itemSize*array.BYTES_PER_ELEMENT,count*attribute.itemSize*array.BYTES_PER_ELEMENT);
    let value=2166136261;for(const byte of bytes)value=Math.imul(value^byte,16777619);return(value>>>0).toString(16).padStart(8,'0');
   };
   for(const [materialIndex,mesh]of batch.group.children.entries()){
    let offset=0;
    for(const plot of selected){
     const source=batch.cache.get(plot)?.[materialIndex],count=source?.getAttribute('position')?.count??0;
     if(!count)continue;
     const attributes={};
     for(const name of ['position','normal','uv']){
      const emitted=mesh.geometry.getAttribute(name),original=source.getAttribute(name);
      if(!emitted||offset+count>emitted.count){emissionErrors.push(`${plot.id}/${materialIndex}/${name}:missing`);continue}
      attributes[name]=hash(emitted,offset,count);
      if(attributes[name]!==hash(original,0,count))emissionErrors.push(`${plot.id}/${materialIndex}/${name}:source-mismatch`);
     }
     (geometry[plot.id]??={})[materialIndex]={count,attributes};offset+=count;
    }
    if(offset!==(mesh.geometry.getAttribute('position')?.count??0))emissionErrors.push(`${materialIndex}:unexpected-emitted-vertices`);
   }
   return{ids:ids.sort(),expectedIds,geometry,emissionErrors,active:structuredClone(stats),visibleMeshes:batch.group.children.filter(m=>m.visible).length};
  };
  window.__streetscapeCheck={world,canvas,fixtures,draw,THREE,bundle,nativeRuns,engine,plotSnapshot};
  // Enter Tokyo once to begin its route-specific concrete/soil texture loads.
  draw(fixtures.find(fixture=>fixture.mode==='street'&&!fixture.part));
  const gl=world.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const programs=world.renderer.info.programs??[],guarded=programs.filter(program=>program.cacheKey.includes('sora-spotlight-early-out-v1'));
  const spotlightPrograms={total:programs.length,guarded:guarded.length,guardedWithCompiledSource:guarded.filter(program=>(gl.getShaderSource(program.fragmentShader)??'').includes('if ( directLight.visible ) { RE_Direct(')).length};
  return {assets:{...canvas.dataset},lighting:world.scene.environment.name,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),spotlightPrograms,fixtures:fixtures.map(({state,...f})=>({...f,tick:state.tick})),nativeRuns};
 });
 assert.ok(report.setup.spotlightPrograms.guarded>0&&report.setup.spotlightPrograms.guardedWithCompiledSource>0,'integrated standard materials compile the zero-spotlight BRDF guard');
 // Global car/scenery flags can finish in arcade before the route-specific
 // ground material exists. Frozen screenshots must wait for all six maps, then
 // redraw once so the actual renderer also updates its ground-ready flag.
 await page.waitForFunction(()=>{
  const maps=window.__streetscapeCheck?.world.groundTextures;
  const plotMaps=window.__streetscapeCheck?.world.cityPlotBatch.group.children.flatMap(mesh=>[mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap]);
  return maps?.length===6&&plotMaps?.length===9&&[...maps,...plotMaps].every(map=>map?.image?.complete&&map.image.naturalWidth>0&&map.image.naturalHeight>0);
 },null,{timeout:60000,polling:100});
 report.groundReady=await page.evaluate(()=>{const f=window.__streetscapeCheck;f.draw(f.fixtures.find(fixture=>fixture.mode==='street'&&!fixture.part));return {assets:{...f.canvas.dataset},maps:f.world.groundTextures.map(map=>({name:map.name,width:map.image.naturalWidth,height:map.image.naturalHeight}))}});
 assert.equal(report.groundReady.assets.groundAsset,'detailed');
 report.cityGardens=await page.evaluate(async()=>{
  const {auditCityGardens}=await import('/scripts/audit-city-gardens.ts');
  return auditCityGardens(window.__streetscapeCheck);
 });
 assert.deepEqual(report.cityGardens.violations,[],'actual garden geometry clears court access and rests on emitted paving');
 report.cityPlotLayout=await page.evaluate(()=>{
  const f=window.__streetscapeCheck,layout=f.world.cityPlotLayout;
  return{stats:layout.stats,plots:layout.plots.map(p=>({id:p.id,buildingId:p.buildingId,p:p.p,court:p.court,access:p.access,accessMetres:p.accessLength,
   pavingTriangles:p.paving.length/9,solids:p.solids})),materials:f.world.cityPlotBatch.group.children.map(mesh=>({name:mesh.name,maps:[mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap].map(map=>({name:map.name,width:map.image.naturalWidth,height:map.image.naturalHeight}))}))};
 });
 assert.ok(report.cityPlotLayout.stats.accepted>0,'Tokyo has actual access courts in its full-route layout');
 report.cityPlotBounds=await page.evaluate(()=>{
  const f=window.__streetscapeCheck,world=f.world,templates=world.cityBatch.bounds,poses=world.course.poses;
  let sourceExcess=0;const actualBounds=[];
  for(const [kind,groups]of [['buildings',world.buildings.slice(0,4)],['apartments',world.apartments.slice(0,2)]])for(const [variant,root]of groups.entries()){
   root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),bounds=templates[kind][variant],actual=new f.THREE.Box3();
   root.traverse(mesh=>{
    if(!mesh.isMesh)return;for(let node=mesh;node&&node!==root;node=node.parent)if(!node.visible)return;
    const matrix=inverse.clone().multiply(mesh.matrixWorld),position=mesh.geometry.getAttribute('position');
    for(let i=0;i<position.count;i++)actual.expandByPoint(new f.THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix));
   });
   sourceExcess=Math.max(sourceExcess,bounds.minX-actual.min.x,actual.max.x-bounds.maxX,bounds.minY-actual.min.y,actual.max.y-bounds.maxY,bounds.minZ-actual.min.z,actual.max.z-bounds.maxZ);
   actualBounds.push({kind,variant,actual:{min:actual.min.toArray(),max:actual.max.toArray()},reserved:bounds});
  }
  const corners=b=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[b.x+Math.cos(b.heading)*b.halfX*x+Math.sin(b.heading)*b.halfZ*z,b.z-Math.sin(b.heading)*b.halfX*x+Math.cos(b.heading)*b.halfZ*z]);
  const obstructions=world.cityLayout.placements.map(p=>({id:p.id,polygon:corners(p.footprint)}));
  for(const p of [...world.streetscape.buildings,...world.streetscape.apartments]){
   let hi=poses.findIndex(v=>v.p>=p.p);hi=Math.max(1,hi);const a=poses[hi-1],b=poses[hi],t=(p.p-a.p)/(b.p-a.p),h=a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t;
   const heading=h+p.side*Math.PI/2+p.yaw,source=(p.kind==='building'?templates.buildings:templates.apartments)[p.variant],cx=(source.minX+source.maxX)*p.scale[0]/2,cz=(source.minZ+source.maxZ)*p.scale[2]/2;
   const x=a.x+(b.x-a.x)*t+Math.cos(h)*p.side*(a.width+(b.width-a.width)*t+p.clearance),z=a.z+(b.z-a.z)*t-Math.sin(h)*p.side*(a.width+(b.width-a.width)*t+p.clearance);
   obstructions.push({id:p.id,polygon:corners({x:x+Math.cos(heading)*cx+Math.sin(heading)*cz,z:z-Math.sin(heading)*cx+Math.cos(heading)*cz,heading,
    halfX:(source.maxX-source.minX)*p.scale[0]/2+.25,halfZ:(source.maxZ-source.minZ)*p.scale[2]/2+.25})});
  }
  const edge=(p,offset)=>[p.x+Math.cos(p.heading)*offset,p.z-Math.sin(p.heading)*offset];
  for(let i=1;i<poses.length;i++){
   const a=poses[i-1],b=poses[i];obstructions.push({id:`native:${i}`,polygon:[edge(a,-a.width-1.67),edge(a,a.width+1.67),edge(b,b.width+1.67),edge(b,-b.width-1.67)]});
   if(Math.floor(a.p/24)%5!==0)for(const side of [-1,1])obstructions.push({id:`masonry:${i}:${side}`,polygon:[edge(a,side*(a.width+13.52)),edge(a,side*(a.width+14.13)),edge(b,side*(b.width+14.13)),edge(b,side*(b.width+13.52))]});
  }
  const keys=polygon=>{const x=polygon.map(p=>p[0]),z=polygon.map(p=>p[1]),result=[];for(let a=Math.floor(Math.min(...x)/32);a<=Math.floor(Math.max(...x)/32);a++)for(let b=Math.floor(Math.min(...z)/32);b<=Math.floor(Math.max(...z)/32);b++)result.push(`${a}:${b}`);return result};
  const grid=new Map();for(const obstacle of obstructions)for(const key of keys(obstacle.polygon)){const items=grid.get(key)??[];items.push(obstacle);grid.set(key,items)}
  const intersects=(a,b)=>![a,b].some(polygon=>polygon.some((point,i)=>{
   const next=polygon[(i+1)%polygon.length],dx=next[0]-point[0],dz=next[1]-point[1],length=Math.hypot(dx,dz);if(length<1e-7)return false;
   const project=poly=>poly.map(p=>(p[0]*-dz+p[1]*dx)/length),pa=project(a),pb=project(b);
   return Math.max(...pa)<=Math.min(...pb)+1e-6||Math.max(...pb)<=Math.min(...pa)+1e-6;
  }));
  const collisions=[];let pavingTriangles=0,solidFootprints=0;
  const check=(polygon,id)=>{for(const obstacle of new Set(keys(polygon).flatMap(key=>grid.get(key)??[])))if(intersects(polygon,obstacle.polygon)&&collisions.length<20)collisions.push({id,obstacle:obstacle.id})};
  for(const plot of world.cityPlotLayout.plots){
   for(let i=0;i<plot.paving.length;i+=9){const p=[0,3,6].map(offset=>[plot.paving[i+offset],plot.paving[i+offset+2]]);if(Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))<1e-7)continue;pavingTriangles++;check(p,plot.id)}
   for(const solid of plot.solids){solidFootprints++;check(corners({x:solid.position[0],z:solid.position[2],heading:solid.heading,halfX:solid.size[0]/2,halfZ:solid.size[2]/2}),plot.id)}
  }
  return{sourceExcess,actualBounds,obstructions:obstructions.length,pavingTriangles,solidFootprints,collisions};
 });
 assert.ok(report.cityPlotBounds.sourceExcess<1e-5,'reserved source bounds include all actual completed mesh vertices');
 assert.deepEqual(report.cityPlotBounds.collisions,[],'all emitted plot geometry clears actual source bounds, native shoulders and existing wall runs');
 if(process.env.COURT_INSPECTION==='1'){
  report.courtInspection=await page.evaluate(architectureAB=>{
   const f=window.__streetscapeCheck,fixture=f.fixtures.find(x=>x.mode==='street'&&x.target===35);f.draw(fixture);
   const world=f.world,beforeNative=JSON.stringify({state:fixture.state,track:f.bundle.track}),beforePlots=f.plotSnapshot(fixture);
   const activeIds=new Set(beforePlots.ids),progress=fixture.state.cars[0].progressMm/1000;
   const delta=p=>Math.abs(((p-progress+world.course.length/2)%world.course.length+world.course.length)%world.course.length-world.course.length/2);
   const plot=world.cityPlotLayout.plots.filter(p=>activeIds.has(p.id)&&p.solids.length).sort((a,b)=>delta(a.p)-delta(b.p))[0];
   if(!plot)throw new Error('The actual 35 m native fixture has no active gate court to inspect');
   const building=world.cityLayout.placements.find(p=>p.id===plot.buildingId),court=plot.court,camera=world.camera;
   const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,aspect:camera.aspect};
   const savedAmbient=world.architectureAmbient.enabled.value;
   let result;
   try{
    camera.position.set(court.x+Math.cos(court.heading)*16-Math.sin(court.heading)*22,building.position[1]+13,
     court.z-Math.sin(court.heading)*16-Math.cos(court.heading)*22);
    const target=new f.THREE.Vector3(court.x,building.position[1]+4.5,court.z).lerp(new f.THREE.Vector3(...building.position).add(new f.THREE.Vector3(0,7,0)),.35);
    camera.fov=55;camera.lookAt(target);camera.updateProjectionMatrix();world.scene.updateMatrixWorld(true);world.treeBatch?.update(camera,world.keyLight);
    world.pass.render(world.scene,camera,world.canvas.width,world.canvas.height,fixture.state.tick/30);
    result={label:'Inspection camera — actual 35 m native fixture, selected court and served building',camera:'inspection orbit; not a gameplay camera',
     nativeProgress:progress,plotId:plot.id,buildingId:building.id,court:plot.court,access:plot.access,solids:plot.solids,
     cameraPosition:camera.position.toArray(),target:target.toArray(),glError:world.renderer.getContext().getError(),png:world.canvas.toDataURL('image/png').split(',')[1]};
    if(architectureAB){
     const gl=world.renderer.getContext(),pixels=[],frames=[];
     for(const enabled of [1,0,1]){
      world.architectureAmbient.enabled.value=enabled;
      const sample=new Uint8Array(world.canvas.width*world.canvas.height*4),times=[];
      for(let i=0;i<7;i++){
       const start=performance.now();world.pass.render(world.scene,camera,world.canvas.width,world.canvas.height,fixture.state.tick/30);
       gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,sample.subarray(0,4));if(i>=2)times.push(performance.now()-start);
      }
      gl.readPixels(0,0,world.canvas.width,world.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,sample);
      pixels.push(sample);frames.push({enabled,medianMs:times.sort((a,b)=>a-b)[2],png:world.canvas.toDataURL('image/png').split(',')[1]});
     }
     let changed=0,restored=0,absoluteDifference=0;
     for(let i=0;i<pixels[0].length;i+=4){let differs=false;for(let c=0;c<3;c++){
      differs ||= pixels[0][i+c]!==pixels[1][i+c];absoluteDifference+=Math.abs(pixels[0][i+c]-pixels[1][i+c]);
      if(pixels[0][i+c]!==pixels[2][i+c])restored++;
     }if(differs)changed++}
     result.architectureAmbient={stats:world.architectureAmbient.stats,frames,changedPixels:changed,restoreDifference:restored,
      meanChannelDifference:absoluteDifference/(pixels[0].length/4*3)};
    }
   }finally{
    world.architectureAmbient.enabled.value=savedAmbient;
    camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.fov=saved.fov;camera.aspect=saved.aspect;camera.updateProjectionMatrix();
    world.scene.updateMatrixWorld(true);world.treeBatch?.update(camera,world.keyLight);world.pass.render(world.scene,camera,world.canvas.width,world.canvas.height,fixture.state.tick/30);
   }
   result.cameraRestored=camera.position.equals(saved.position)&&camera.quaternion.equals(saved.quaternion)&&camera.fov===saved.fov&&camera.aspect===saved.aspect;
   result.nativeUnchanged=JSON.stringify({state:fixture.state,track:f.bundle.track})===beforeNative;
   result.plotGeometryUnchanged=JSON.stringify(f.plotSnapshot(fixture))===JSON.stringify(beforePlots);
   return result;
  },process.env.ARCHITECTURE_AB==='1');
  await writeFile(`${out}/actual-court-inspection.png`,Buffer.from(report.courtInspection.png,'base64'));delete report.courtInspection.png;
  if(report.courtInspection.architectureAmbient){
   const audit=report.courtInspection.architectureAmbient;
   for(const [i,frame]of audit.frames.entries()){await writeFile(`${out}/court-ambient-${i}-${frame.enabled?'on':'off'}.png`,Buffer.from(frame.png,'base64'));delete frame.png}
   assert.ok(audit.changedPixels>1000,'actual architectural enclosure shading affects the detailed scene');assert.equal(audit.restoreDifference,0,'source ambient on/off/on restores every channel');
  }
  assert.ok(report.courtInspection.cameraRestored&&report.courtInspection.nativeUnchanged&&report.courtInspection.plotGeometryUnchanged);assert.equal(report.courtInspection.glError,0);
 }
 for(const fixture of report.setup.fixtures.filter(f=>!f.part)){
  for(const camera of fixture.mode==='street'?['chase','aerial']:['chase']){
   const frame=await page.evaluate(({label,camera})=>{
    const f=window.__streetscapeCheck,fixture=f.fixtures.find(x=>x.label===label);f.draw(fixture,camera);
    const world=f.world,plan=world.streetscape,source=new Map([...plan.buildings,...plan.apartments,...plan.trees].map(x=>[x.id,x]));
    const groups=[...world.buildings,...world.apartments].filter(g=>g.visible);
    const bounds=groups.map(group=>{
     const placement=source.get(group.userData.raceSceneryStation),foot=placement.footprint,c=Math.cos(foot.heading),s=Math.sin(foot.heading);let excessX=0,excessZ=0,props=[];
     group.traverse(object=>{if(object.userData.shopPropKind)props.push(object.userData.shopPropKind);if(!object.isMesh)return;object.geometry.computeBoundingBox();const b=object.geometry.boundingBox;
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const v=new f.THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld),dx=v.x-foot.x,dz=v.z-foot.z;excessX=Math.max(excessX,Math.abs(c*dx-s*dz)-foot.halfX);excessZ=Math.max(excessZ,Math.abs(s*dx+c*dz)-foot.halfZ)}
     });return{id:placement.id,variant:placement.variant,block:placement.block,p:placement.p,props,excessX,excessZ};
    });
    const gl=world.renderer.getContext();return {label,camera,mode:fixture.mode,tick:fixture.state.tick,progress:fixture.progress,nativeUnchanged:true,lighting:world.scene.environment.name,glError:gl.getError(),counts:{houses:world.buildings.filter(x=>x.visible).length,apartments:world.apartments.filter(x=>x.visible).length,trees:world.trees.filter(x=>x.visible).length},city:world.cityLayout?{layout:world.cityLayout.stats,active:world.cityBatch.group.userData.cityBlockStats}:null,cityPlots:f.plotSnapshot(fixture),bounds,png:f.canvas.toDataURL('image/png').split(',')[1]};
   },{label:fixture.label,camera});
   await writeFile(`${out}/${fixture.label}-${camera}.png`,Buffer.from(frame.png,'base64'));delete frame.png;report.frames.push(frame);assert.equal(frame.glError,0);assert.ok(frame.bounds.every(b=>b.excessX<.4&&b.excessZ<.4),'source models and props remain inside the planner clearance allowance');
  }
 }
 for(const mode of ['street','arcade'])for(const boundary of mode==='street'?[20,160,440]:[280,840]){
  const value=await page.evaluate(({mode,boundary})=>{
   const f=window.__streetscapeCheck;const snapshot=()=>{
    const entries=[...f.world.buildings,...f.world.apartments,...f.world.trees].filter(g=>g.visible).map(g=>{g.updateMatrix();return[g.userData.raceSceneryStation,{uuid:g.uuid,matrix:g.matrix.elements.slice()}]});
    const matrix=new f.THREE.Matrix4();
    for(const mesh of f.world.cityBatch?.group.children??[])for(const [i,id] of mesh.userData.cityBlockIds.entries()){
     mesh.getMatrixAt(i,matrix);entries.push([`city:${mesh.uuid}:${id}`,{uuid:mesh.uuid,matrix:matrix.elements.slice()}]);
    }
    return Object.fromEntries(entries);
   };
   const beforeFixture=f.fixtures.find(x=>x.mode===mode&&x.boundary===boundary&&x.part==='before'),afterFixture=f.fixtures.find(x=>x.mode===mode&&x.boundary===boundary&&x.part==='after');
   f.draw(beforeFixture);const before=snapshot(),plotsBefore=f.plotSnapshot(beforeFixture);
   f.draw(afterFixture);const after=snapshot(),plotsAfter=f.plotSnapshot(afterFixture);
   const kept=Object.keys(before).filter(id=>after[id]),shifted=kept.filter(id=>before[id].matrix.some((n,i)=>Math.abs(n-after[id].matrix[i])>1e-8)),reassigned=kept.filter(id=>before[id].uuid!==after[id].uuid);
   const keptPlots=plotsBefore.ids.filter(id=>plotsAfter.ids.includes(id)),changedPlots=keptPlots.filter(id=>JSON.stringify(plotsBefore.geometry[id])!==JSON.stringify(plotsAfter.geometry[id]));
   return{mode,boundary,before:Object.keys(before).length,after:Object.keys(after).length,retained:kept.length,shifted,reassigned,frontage:{before:Object.keys(before).filter(id=>!id.startsWith('city:')).length,after:Object.keys(after).filter(id=>!id.startsWith('city:')).length,retained:kept.filter(id=>!id.startsWith('city:')).length},cityPlots:{before:plotsBefore,after:plotsAfter,retained:keptPlots.length,changed:changedPlots}};
  },{mode,boundary});report.stability.push(value);assert.deepEqual(value.shifted,[]);assert.deepEqual(value.reassigned,[]);assert.ok(value.retained>0);assert.ok(value.frontage.retained>=Math.min(value.frontage.before,value.frontage.after)-5);
  assert.deepEqual(value.cityPlots.changed,[],'retained access courts cannot change emitted geometry at scenery-cell boundaries');
  for(const snapshot of [value.cityPlots.before,value.cityPlots.after]){assert.deepEqual(snapshot.ids,snapshot.expectedIds);assert.deepEqual(snapshot.emissionErrors,[]);if(mode==='arcade'){assert.deepEqual(snapshot.ids,[]);assert.equal(snapshot.visibleMeshes,0)}}
 }
 report.courseSwitches = await page.evaluate(() => {
  const f=window.__streetscapeCheck, result=[];
  for(const style of [0,2,1,0]) {
   const state=f.engine.createRace(style,8);
   while(state.cars[6].progress<60000)f.engine.stepRace(state,state.cars.map((_,slot)=>f.engine.botControl(state,slot)));
   f.draw({mode:'arcade',state,controls:0});
   const byId=new Map(f.world.streetscape.buildings.map(p=>[p.id,p]));
   const mismatches=f.world.buildings.filter(g=>g.visible).flatMap(g=>{const p=byId.get(g.userData.raceSceneryStation),actual=Number(g.name.split('-').at(-1));return actual!==p.variant?[{id:p.id,expected:p.variant,actual}]:[]});
   result.push({style,tick:state.tick,mismatches,cityPlots:f.plotSnapshot({mode:'arcade',state})});
  }
  return result;
 });
 for(const frame of report.frames) {
  assert.deepEqual(frame.cityPlots.ids,frame.cityPlots.expectedIds);assert.deepEqual(frame.cityPlots.emissionErrors,[]);
  if(frame.mode==='street'){
   assert.ok(frame.city?.active.visibleBuildings>0&&frame.city.active.visibleApartments>0,'Tokyo has grounded secondary low-rise and apartment depth');
   assert.ok(frame.cityPlots.active.visiblePlots>0&&frame.cityPlots.visibleMeshes<=3,'Tokyo access courts use bounded real geometry');
  }else{assert.equal(frame.city,null,'secondary city blocks remain outside rural courses');assert.deepEqual(frame.cityPlots.ids,[]);assert.equal(frame.cityPlots.visibleMeshes,0);assert.equal(frame.cityPlots.active.triangles,0)}
 }
 for(const result of report.courseSwitches){assert.deepEqual(result.mismatches,[],'course changes cannot retain the previous course source variant');assert.deepEqual(result.cityPlots.ids,[]);assert.equal(result.cityPlots.visibleMeshes,0);assert.deepEqual(result.cityPlots.emissionErrors,[])}
 if(process.env.CITY_COST==='1')report.cityCost=await page.evaluate(()=>{
  const f=window.__streetscapeCheck,world=f.world,gl=world.renderer.getContext(),pixel=new Uint8Array(4),results=[];
  for(const target of [35,435]){
   const fixture=f.fixtures.find(x=>x.mode==='street'&&x.target===target);f.draw(fixture);
   const draw=()=>{world.renderer.info.autoReset=false;world.renderer.info.reset();f.draw(fixture);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return {...world.renderer.info.render}};
   try{for(const visible of [true,false,true]){
    world.cityBatch.group.visible=visible;for(let i=0;i<3;i++)draw();const times=[];let stats;
    for(let i=0;i<7;i++){const start=performance.now();stats=draw();times.push(performance.now()-start)}
    times.sort((a,b)=>a-b);results.push({target,visible,medianMs:times[3],minMs:times[0],maxMs:times[6],stats});
   }}finally{world.cityBatch.group.visible=true;world.renderer.info.autoReset=true;f.draw(fixture)}
  }
  return results;
 });
 assert.equal(report.errors.length,0);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({frames:report.frames.length,stability:report.stability,errors:report.errors}));
}finally{await browser.close()}
