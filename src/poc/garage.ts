import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { loadDetailedCarFleet } from '../game/three/asset-car';
import { loadShopProps } from '../game/three/shop-props';
import { scannedSurface, scannedSurfacesReady } from '../game/three/surfaces';
import { createCutsceneRenderer } from './cutscene-renderer';
import { createPaintedSurfaces } from './painted-surfaces';
import { createDuskEnvironment } from '../game/three/dusk-environment';
import { VehicleAmbientOcclusion } from '../game/three/vehicle-ambient';
import { loadWorkshopSteel } from './workshop-steel';
import { loadWorkshopConcrete } from './workshop-concrete';
import { createPaintedSky } from './painted-sky';
import { refineParkedHeadlamps } from './painted-headlamps';
import { createGarageHorizon } from './garage-horizon';
import { createGarageShoreline } from './garage-shoreline';
import { createGarageEngine } from './engine-assembly';
import { createWorkshopShelfContents } from './shelf-contents';
import { concreteFieldShader, concreteStrokeCoverageShader, createPaintedFloor } from './painted-floor';
import { captureGarageCarReflections } from './garage-car-reflections';
import { createGarageSoftShadows } from './garage-soft-shadows';
import { createGarageGlazing } from './garage-glazing';
import { openGarageHood } from './garage-open-hood';
import { createGarageHoodLiner } from './garage-hood-liner';
import { createGarageEngineBay } from './garage-engine-bay';
import { loadPaintedMarks } from './painted-marks';
import { createIllustratedMaterials } from './illustrated-materials';
import { loadIllustratedReflections } from './illustrated-reflections';
import { loadIllustratedEnamel } from './illustrated-enamel';
import { prepareEnamelTopology } from './enamel-topology';
import { prepareWorkshopEdgePaint } from './illustrated-edge-paint';
import { paintGarageFrontApron } from './garage-painted-apron';
import { createGarageArchitecturalSteel } from './garage-architectural-steel';
import { createClusteredLighting } from './clustered-lighting';

// Isolated visual proof. No game world, controls, simulation or saved settings.
const canvas = document.querySelector<HTMLCanvasElement>('#poc')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene(); scene.background = new THREE.Color('#262640');
const camera = new THREE.PerspectiveCamera(45, 1, .08, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .09;
controls.minDistance = 4; controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * .47; controls.autoRotateSpeed = .45;
const pass = createCutsceneRenderer(renderer); pass.setPixelation(true);
const paintedSurfaces = createPaintedSurfaces();
const illustratedMaterials=createIllustratedMaterials();
const materialStudy=new URLSearchParams(location.search).get('style')!=='previous';
const clusterStudy=materialStudy&&new URLSearchParams(location.search).get('style')!=='materials';
const clusteredLighting=createClusteredLighting();
clusteredLighting.configure({diffuseBands:1,specularStrength:0,shadeTint:.35});
pass.setIllustrated(materialStudy);
pass.clusters.configure({spacing:5,compactness:.3,colorScale:.065,iterations:4,
  paletteSteps:0,mergeRounds:6,mergeScale:2,neighborStrength:.5,
  mergeColorScale:.055,detailStrength:.3,directionStrength:1,fineToneStrength:.85});
pass.setPixelClusters(clusterStudy);
// Region grouping is the intentional pixel structure. Keep the final display
// grid at one physical pixel so thin mechanical details survive on desktop.
pass.setPixelation(!clusterStudy);
// Painted albedo stays attached; retain most of the detailed physical light
// response. Full stepped lighting flattened dark rubber and machined metal.
illustratedMaterials.setLightingStyleStrength(materialStudy?.35:1);
pass.setLightBloom(materialStudy?.025:0);
// Thin catches on the lit side of geometric ridges, inspected separately from
// dark object/material ink. The source meshes and lighting remain 3D.
pass.linework.setInlineStrength(clusterStudy ? 0 : materialStudy ? .6 : 0);
pass.linework.setCreaseStrength(clusterStudy ? 1 : 0);
pass.linework.setContrastSuppression(clusterStudy ? .7 : 0);
const softShadows=createGarageSoftShadows();
const glazing=createGarageGlazing();
const carReflectionCaptures:ReturnType<typeof captureGarageCarReflections>[]=[];
const reflectedCarMaterials: {material:THREE.MeshStandardMaterial,texture:THREE.Texture,source:THREE.Texture|null,intensity:number}[]=[];
const localReflections={setEnabled(enabled:boolean){
  for(const entry of reflectedCarMaterials){
    entry.material.envMap=enabled?entry.texture:entry.source;
    entry.material.envMapIntensity=enabled?(entry.material.name==='Primary'?1:.7):entry.intensity;
    entry.material.needsUpdate=true;
  }
}};
const engineReflectionCaptures:ReturnType<typeof captureGarageCarReflections>[]=[];
const reflectedEngineMaterials: {material:THREE.MeshStandardMaterial,texture:THREE.Texture,source:THREE.Texture|null,intensity:number,rotation:THREE.Euler}[]=[];
const engineReflections={setEnabled(enabled:boolean){
  for(const entry of reflectedEngineMaterials){
    entry.material.envMap=enabled?entry.texture:entry.source;
    entry.material.envMapIntensity=enabled?1:entry.intensity;
    if(enabled)entry.material.envMapRotation.set(0,0,0);
    else entry.material.envMapRotation.copy(entry.rotation);
    entry.material.needsUpdate=true;
  }
}};
const paintedSky=createPaintedSky();scene.add(paintedSky.mesh);
scene.add(createGarageHorizon());
const shoreline=createGarageShoreline();scene.add(shoreline.group);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const meshes: THREE.Mesh[] = [];
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x=0,y=0,z=0, ry=0) {
  const o = new THREE.Mesh(g,m); o.position.set(x,y,z); o.rotation.y=ry;
  o.castShadow=o.receiveShadow=true; scene.add(o); meshes.push(o); return o;
}
function box(m: THREE.Material,w:number,h:number,d:number,x:number,y:number,z:number,r=.015,ry=0) {
  return mesh(r ? new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)) : new THREE.BoxGeometry(w,h,d),m,x,y,z,ry);
}
function rod(m: THREE.Material,a:THREE.Vector3,b:THREE.Vector3,r:number) {
  const o=mesh(new THREE.CylinderGeometry(r,r,a.distanceTo(b),12),m);
  o.position.copy(a).lerp(b,.5); o.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize()); return o;
}
const paint = (color:string,roughness=.65,metalness=.05) => new THREE.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.15,clearcoatRoughness:.4});
const iron=paint('#363b3c',.56,.65), red=paint('#a33427',.46,.12), rubber=paint('#242528',.97,0);
const brass=paint('#b99854',.37,.72), timber = new THREE.MeshStandardMaterial({...scannedSurface('japanese_cedar_planks'),color:'#958066',roughness:.88});
iron.userData.workshopEdgePaint='steel';
red.userData.workshopEdgePaint='cabinet';
timber.userData.workshopEdgePaint='timber';
const wall=new THREE.MeshStandardMaterial({...scannedSurface('grey_plaster_03',3),color:'#a49b86',normalScale:new THREE.Vector2(.4,.4),roughness:.98});
const floorMaterial=new THREE.MeshStandardMaterial({...scannedSurface('asphalt_02',7),color:'#b0a493',roughness:.62,normalScale:new THREE.Vector2(.38,.38),metalness:0});
const floor=mesh(new THREE.PlaneGeometry(24,27),floorMaterial,0,0,1);floor.rotation.x=-Math.PI/2;
const ambient = new VehicleAmbientOcclusion(); ambient.decorate(floorMaterial);
const paintedFloor=createPaintedFloor(floorMaterial);
// The revised pigment path preserves the authored broad underpainting as well
// as fine detail. Retain a little continuous light between the painted regions.
paintedFloor.setIllustratedStrength(materialStudy ? .8 : 0);
paintedFloor.setInteriorStrength(materialStudy ? 1 : 0);
const beam=paint('#4b504a',.74,.32);
// A real ceiling closes the garage; the sunset is framed by its rear shutter.
box(beam,12.9,.16,13.5,0,4.97,.5);
// Open rear shutter frames the exterior. The camera-facing side stays open.
box(wall,.25,4.9,13,-6.3,2.45,.5);
box(wall,.25,4.9,4,6.3,2.45,-4);
box(wall,2.4,4.9,.26,-5.15,2.45,-6);
box(wall,2.0,4.9,.26,5.3,2.45,-6);
box(beam,8.7,.4,.45,.2,4.62,-6);
for(const x of [-4,4.4]) {
  box(beam,.24,4.55,.28,x,2.28,-5.91);
  for(let y=.3;y<4.5;y+=.4)box(brass,.032,.032,.015,x+.06,y,-5.752,.004);
}
// Rolled shutter, ribbed overhead structure, conduit and bolted steelwork.
for(let i=0;i<12;i++)box(iron,8.45,.082,.07,.2,4.08+i*.079,-5.72,.008);
for(const z of [-5.85,-2.6,1.2,4.6]) {
  for(const x of [-5.9,5.9])rod(beam,v(x,3.8,z),v(x-Math.sign(x)*.9,4.7,z),.045);
}
for(const x of [-5.95,-5.78])rod(iron,v(x,.5,-5.7),v(x,4.57,-5.7),.027);
rod(iron,v(-5.95,4.57,-5.7),v(5.95,4.57,-5.7),.027);
const architecturalSteel=createGarageArchitecturalSteel({panel:wall,frame:beam,fastener:iron});
scene.add(architecturalSteel);

function label(lines:string[],bg:string,ink:string,width:number,height:number) {
  const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*height/width);
  const t=c.getContext('2d')!;t.fillStyle=bg;t.fillRect(0,0,c.width,c.height);
  t.strokeStyle=ink;t.lineWidth=4;t.strokeRect(25,25,c.width-50,c.height-50);
  t.textAlign='center';t.textBaseline='middle';t.fillStyle=ink;
  lines.forEach((line,i)=>{t.font=`800 ${Math.min(c.height/(lines.length+1)*.65,180)}px "Hiragino Kaku Gothic ProN",Arial`;t.fillText(line,512,c.height*(i+1)/(lines.length+1),940)});
  // Sparse physical paint loss in the print, rather than a frame-wide noise overlay.
  let seed=58;for(let i=0;i<900;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const x=(seed>>>0)%1024;seed=(Math.imul(seed,1664525)+1013904223)|0;const y=(seed>>>0)%c.height;t.fillStyle=i%2?'#51483e55':'#decda244';t.fillRect(x,y,1+(i%6),1+(i%3));}
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  return new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide});
}
const banner=label(['天','SORA','MOTOR CLUB'],'#82291f','#e6d4af',1.55,2.25);
mesh(new THREE.PlaneGeometry(1.55,2.25,1,1),banner,-5.0,3.03,-5.79);
mesh(new THREE.PlaneGeometry(.9,2.1),label(['走る仲間','1986'],'#303840','#d5c9ac',.9,2.1),4.95,2.75,-5.79);
// Foreground tool trolley, individually articulated drawers and caster wheels.
function trolley(x:number,z:number,angle:number,tools=true) {
  const g=new THREE.Group();scene.add(g);
  const parts:THREE.Object3D[]=[];
  const add=(o:THREE.Object3D)=>{scene.remove(o);g.add(o);parts.push(o);};
  add(box(red,1.25,.87,.65,0,.66,0,.025));
  add(box(iron,1.36,.065,.72,0,1.12,0,.012));
  for(let i=0;i<6;i++) {add(box(rubber,1.16,.121,.019,0,.32+i*.134,.337,.002));add(box(red,1.13,.108,.025,0,.32+i*.134,.35,.006));add(box(iron,.93,.022,.038,0,.35+i*.134,.381,.004));}
  for(const a of [-.48,.48])for(const b of [-.23,.23]){const w=mesh(new THREE.CylinderGeometry(.105,.105,.07,24),rubber,a,.105,b);w.rotation.z=Math.PI/2;add(w);add(box(iron,.045,.15,.05,a,.22,b));}
  add(rod(iron,v(-.62,1,-.2),v(-.82,1,-.2),.021));
  add(rod(iron,v(-.82,1,-.2),v(-.82,1,.2),.021));
  if(tools)for(let i=0;i<9;i++){const w=rod(i%2?brass:iron,v(-.48+i*.11,1.165,-.18),v(-.35+i*.09,1.165,.18),.013);add(w);}
  g.position.set(x,0,z);g.rotation.y=angle;return g;
}
const engineTrolley=trolley(3.7,3.75,-.24,false);trolley(-4.7,1.4,.25);
const displayedEngine=createGarageEngine();displayedEngine.position.set(0,1.154,0);engineTrolley.add(displayedEngine);
function crate(x:number,y:number,z:number,scale=1) {
  const g=new THREE.Group();scene.add(g);
  const add=(o:THREE.Mesh)=>{scene.remove(o);g.add(o)};
  for(const a of [-.38,.38])for(const b of [-.28,.28])add(box(timber,.055,.58,.055,a,.29,b));
  for(let i=0;i<4;i++)for(const s of [-1,1]){add(box(timber,.84,.108,.028,0,.075+i*.143,s*.294));add(box(timber,.028,.108,.6,s*.401,.075+i*.143,0));}
  add(box(timber,.79,.036,.59,0,.02,0));
  const plate=mesh(new THREE.PlaneGeometry(.38,.16),label(['SORA / 部品'],'#c6b38c','#333931',.38,.16),0,.32,.312);add(plate);
  g.position.set(x,y,z);g.scale.setScalar(scale);return g;
}
crate(-3.8,0,4.8);crate(-4.45,0,4.15);crate(-4.48,.58,4.17,.9);crate(4.35,0,-3.8);
// Wall shelving: repeated construction with irregular specific objects.
for(const y of [.5,1.3,2.15,3.0])box(timber,1.25,.075,4.3,-5.5,y,-.95);
for(const z of [-3.0,1.0])for(const x of [-6.05,-4.95])box(iron,.052,3.45,.052,x,1.73,z);
const shelfContents=createWorkshopShelfContents();
shelfContents.position.set(-5.25,0,-.95);shelfContents.rotation.y=Math.PI/2;scene.add(shelfContents);
// Pendant fixtures are part of the scene and their lights cast real shadows.
const emitter=new THREE.MeshStandardMaterial({color:'#ffe0a1',emissive:'#ffcb72',emissiveIntensity:5,roughness:.4});
function pendant(x:number,z:number,power:number,hero=false) {
  rod(iron,v(x,4.78,z),v(x,3.75,z),.016);
  const profile=[[.05,.24],[.12,.18],[.3,.06],[.4,0],[.39,-.035],[.28,.02],[.1,.15]].map(p=>new THREE.Vector2(p[0],p[1]));
  mesh(new THREE.LatheGeometry(profile,48),iron,x,3.65,z);
  const disc=mesh(new THREE.CircleGeometry(.34,48),emitter,x,3.635,z);disc.rotation.x=Math.PI/2;disc.castShadow=false;
  const l=new THREE.SpotLight(hero?'#ffd08a':'#ffd59b',power,12,hero?.70:.76,.54,2);
  l.position.set(x,3.6,z);l.target.position.set(hero?.45:x,0,hero?1.8:z);
  l.castShadow=true;l.shadow.mapSize.set(2048,2048);l.shadow.bias=-.00015;l.shadow.normalBias=.012;
  l.shadow.radius=hero?24:18;
  scene.add(l,l.target);
}
pendant(-1.4,1.0,80,true);pendant(-4.7,-2.2,28);pendant(3,-3.4,28);
// Broad warm reflection source, corresponding to the workshop's overhead tubes.
for(const x of [-2.4,2.6]){
  box(iron,2.8,.11,.23,x,4.47,-2.9);box(emitter,2.65,.025,.15,x,4.401,-2.9).castShadow=false;
  const a=new THREE.RectAreaLight('#ffd2a0',2.2,2.65,.25);a.position.set(x,4.36,-2.9);a.lookAt(x,0,-2.9);scene.add(a);
}
const fill=new THREE.HemisphereLight('#b7b4c8','#554530',.34);scene.add(fill);
const windowLight=new THREE.RectAreaLight('#828dcc',1.0,8,4);windowLight.position.set(.2,2.2,-5.8);windowLight.lookAt(0,1,2);scene.add(windowLight);
// Open exterior uses the same photographed HDR radiance as the lighting.
// The garage, cars, foreground equipment and reflected scene remain geometry.
const frontSoftbox=new THREE.RectAreaLight('#ffdbac',1.5,4.5,3.2);
frontSoftbox.position.set(1,3.7,6);frontSoftbox.lookAt(-.5,.7,0);scene.add(frontSoftbox);
// Local inspection light reaches the pulley faces and cast-metal relief.
const engineBenchKey=new THREE.RectAreaLight('#ffdbac',6,1.05,.55);
engineBenchKey.name='Engine inspection key';
engineBenchKey.position.set(3.2,2.6,5.25);engineBenchKey.lookAt(3.7,1.6,3.75);scene.add(engineBenchKey);
const benchFill=new THREE.RectAreaLight('#ffd299',3.4,2.8,2.0);
benchFill.position.set(-3.5,2.7,.3);benchFill.lookAt(-5.5,1.7,-1);scene.add(benchFill);
// The front bench faces into the room. Its visible tube lights the tools,
// rather than presenting the unlit back of the pegboard to the camera.
box(iron,.22,.075,1.6,-5.05,2.2,2.5);
box(emitter,.13,.025,1.48,-5.02,2.15,2.5).castShadow=false;
const toolLight=new THREE.RectAreaLight('#ffd2a0',3.5,1.48,.2);
toolLight.position.set(-5.0,2.11,2.5);toolLight.lookAt(-5.2,.9,2.5);scene.add(toolLight);
for(const x of [3.4,4.7])rod(iron,v(x,4.82,-1.38),v(x,2.2,-1.38),.012);
box(iron,1.5,.075,.22,4.05,2.16,-1.38);
box(emitter,1.4,.025,.13,4.05,2.11,-1.36).castShadow=false;
const rightToolLight=new THREE.RectAreaLight('#ffd2a0',3.5,1.4,.2);
rightToolLight.position.set(4.05,2.07,-1.33);rightToolLight.lookAt(4.05,.9,-1.6);scene.add(rightToolLight);
for(const x of [-4.0,-1,2,5])rod(iron,v(x,0,-8),v(x,1.1,-8),.032);
rod(iron,v(-4,1.06,-8),v(5,1.06,-8),.034);

// Local planar reflections: actual mirrored 3D scene, masked by surface wear.
const reflector=new Reflector(new THREE.PlaneGeometry(24,27),{textureWidth:1024,textureHeight:1024,multisample:0,clipBias:.001,
  shader:{name:'Garage damp-floor reflection',uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},normalMap:{value:null},roughnessMap:{value:null},painted:{value:1}},
  vertexShader:`uniform mat4 textureMatrix;varying vec4 reflectionUv;varying vec2 floorUv;varying vec2 floorWorld;void main(){floorUv=uv;floorWorld=(modelMatrix*vec4(position,1.)).xz;reflectionUv=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform sampler2D normalMap;uniform sampler2D roughnessMap;uniform float painted;varying vec4 reflectionUv;varying vec2 floorUv;varying vec2 floorWorld;
    ${concreteFieldShader}
    ${concreteStrokeCoverageShader}
    void main(){
    vec2 normalUv=floorUv*7.;
    vec2 normalDx=dFdx(normalUv)*max(1.,.07/max(length(dFdx(floorWorld)),.0001));
    vec2 normalDy=dFdy(normalUv)*max(1.,.07/max(length(dFdy(floorWorld)),.0001));
    vec3 normalScan=mix(texture2D(normalMap,normalUv).rgb,textureGrad(normalMap,normalUv,normalDx,normalDy).rgb,painted);
    vec2 n=normalScan.xy-.5;vec2 uv=reflectionUv.xy/reflectionUv.w+n*.004;
    vec3 c=texture2D(tDiffuse,uv).rgb*.4;for(int i=0;i<4;i++){vec2 o=vec2(i<2?-1.:1.,i==0||i==2?-1.:1.)*.0015;c+=texture2D(tDiffuse,uv+o).rgb*.15;}
    float r=texture2D(roughnessMap,floorUv*7.).g;float dampness=.5+.25*sin(floorUv.x*53.+sin(floorUv.y*39.))+.25*sin(floorUv.y*61.);
    float wet=smoothstep(.24,.68,dampness)*(.55+.45*(1.-r));
    // Authored angular strokes share their floor-space coverage with the real
    // material's roughness. Normal-map blue is a direction, not a wetness mask.
    vec2 strokeField=concreteStrokeSample(floorWorld);
    float strokeCoverage=mix(1.,strokeField.y,concreteCoverageBlend());
    float concreteDamp=smoothstep(.58,.75,concreteField(floorWorld*.57+31.));
    float fragmentAlpha=mix(.004,.29,strokeCoverage)*concreteDamp;
    gl_FragColor=vec4(c,mix(wet*.22,fragmentAlpha,painted));}`}});
reflector.rotation.x=-Math.PI/2;reflector.position.set(0,.006,1);
const reflectionMaterial=reflector.material as THREE.ShaderMaterial;
Object.assign(reflectionMaterial.uniforms,paintedFloor.coverageUniforms);
reflectionMaterial.uniforms.normalMap!.value=floorMaterial.normalMap;reflectionMaterial.uniforms.roughnessMap!.value=floorMaterial.roughnessMap;
reflectionMaterial.transparent=true;reflectionMaterial.depthWrite=false;reflectionMaterial.toneMapped=false;scene.add(reflector);

function reset(){
  // Drain OrbitControls' pending drag inertia before restoring the exact pose.
  controls.autoRotate=false;controls.enableDamping=false;controls.update();
  camera.position.set(4.5,1.9,6.4);controls.target.set(-.6,1.05,-.2);controls.update();
  controls.enableDamping=true;
}
reset();
let ready=false, pixel=!clusterStudy, painted=!clusterStudy, grouping=clusterStudy, contours=materialStudy,
  lightPlanes=clusterStudy, reference=false, frozen=false;
const button=(id:string)=>document.querySelector<HTMLButtonElement>(`#${id}`)!;
function applyMaterialPaint(){pass.setPainted(painted);paintedSurfaces.setEnabled(painted);illustratedMaterials.setEnabled(painted);paintedFloor.setEnabled(painted);glazing.setPainted(painted);shoreline.setPainted(painted);reflectionMaterial.uniforms.painted!.value=painted?1:0;button('paint').setAttribute('aria-pressed',String(painted));
  // The legacy authored-material comparison owns its original lighting model.
  // The new light-only renderer is evaluated with those texture paths off.
  clusteredLighting.configure({strength:lightPlanes&&!painted?1:0});
  button('lighting').setAttribute('aria-pressed',String(lightPlanes&&!painted));
}
button('paint').onclick=()=>{painted=!painted;applyMaterialPaint();};
button('lighting').onclick=()=>{lightPlanes=painted||!lightPlanes;painted=false;applyMaterialPaint();};
button('clusters').setAttribute('aria-pressed',String(grouping));
button('clusters').onclick=()=>{grouping=!grouping;pass.setPixelClusters(grouping);button('clusters').setAttribute('aria-pressed',String(grouping));};
pass.setGeometryLinework(contours);
button('contours').setAttribute('aria-pressed',String(contours));
button('contours').onclick=()=>{contours=!contours;pass.setGeometryLinework(contours);button('contours').setAttribute('aria-pressed',String(contours));};
button('pixel').onclick=()=>{pixel=!pixel;pass.setPixelation(pixel);button('pixel').setAttribute('aria-pressed',String(pixel));};
button('pixel').setAttribute('aria-pressed',String(pixel));
button('orbit').onclick=()=>{controls.autoRotate=!controls.autoRotate;button('orbit').setAttribute('aria-pressed',String(controls.autoRotate));};
button('reset').onclick=()=>{controls.autoRotate=false;button('orbit').setAttribute('aria-pressed','false');reset();};
button('compare').onclick=()=>{reference=!reference;document.querySelector<HTMLElement>('#reference')!.style.display=reference?'block':'none';button('compare').setAttribute('aria-pressed',String(reference));};
function render(){
  const width=stage.clientWidth,height=stage.clientHeight,dpr=Math.min(devicePixelRatio,2);
  camera.aspect=width/height;
  // Keep enough horizontal coverage for the whole car on narrow portrait screens.
  const portraitFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(50/2))/camera.aspect));
  camera.fov=camera.aspect<1?Math.max(65,portraitFov):45;
  camera.updateProjectionMatrix();pass.render(scene,camera,width*dpr,height*dpr,0);
}
function animate(){requestAnimationFrame(animate);if(ready&&!frozen&&!reference){controls.update();render();}}
animate();
async function load(){
  const flag=await new THREE.TextureLoader().loadAsync('/assets/sora-flag.png');flag.colorSpace=THREE.SRGBColorSpace;
  const [fleet,props,hdr,steel,concrete,paintMarks,reflectionPaint,enamelAtlas]=await Promise.all([loadDetailedCarFleet(flag),loadShopProps(),new HDRLoader().loadAsync('/assets/lighting/qwantani-dusk.hdr'),loadWorkshopSteel(),loadWorkshopConcrete(),loadPaintedMarks(),loadIllustratedReflections(),loadIllustratedEnamel()]);
  paintedFloor.setAuthoredTexture(concrete);
  paintedFloor.setCoverageTexture(paintMarks);
  paintedSurfaces.setPaintMarks(paintMarks);
  paintedSurfaces.setPaintMarksStrength(0);
  illustratedMaterials.setTexture(paintMarks);
  if(materialStudy)illustratedMaterials.setEnamelAtlas(enamelAtlas);
  if(materialStudy){illustratedMaterials.setReflectionMap(reflectionPaint);glazing.setReflectionMap(reflectionPaint);glazing.setReflectionStrength(.35);}
  const dusk=createDuskEnvironment(renderer,hdr);hdr.dispose();scene.background=dusk.texture;scene.environment=dusk.texture;
  scene.environmentIntensity=.12;scene.backgroundIntensity=.11;scene.backgroundRotation.y=scene.environmentRotation.y=4.71;
  const placements=[{x:-.65,z:1.0,yaw:.10,color:'#ede1c4'},{x:-2.35,z:-4.4,yaw:-.35,color:'#ad372d'}];
  placements.forEach((p,i)=>{const car=fleet[i]!;car.setAppearance(p.color,'#c2bcb1');car.animate(0,0,false,false,0);car.group.position.set(p.x,.012,p.z);car.group.rotation.y=p.yaw;
    car.group.getObjectByName('DetailedSeatedDriver')?.removeFromParent();car.group.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshPhysicalMaterial;if(m.name==='Primary'){m.roughness=.25;if(m.isMeshPhysicalMaterial){m.clearcoat=.85;m.clearcoatRoughness=.11;}}}});scene.add(car.group);ambient.setCar(i,car.group.position,p.yaw,1);});
  const hero=fleet[0]!.group;
  const enamelTopology=materialStudy?fleet.slice(0,placements.length).map(car=>prepareEnamelTopology(car.group)):[];
  const hood=openGarageHood(hero);
  const paintedAprons=fleet.slice(0,placements.length).map(car=>paintGarageFrontApron(car.group));
  const hoodLiner=createGarageHoodLiner(hood.hinge);hood.pivot.add(hoodLiner);
  const engineBay=createGarageEngineBay();hero.add(engineBay);
  // A physical prop rod joins the fixed front wing to the raised inner frame.
  hood.pivot.updateMatrix();
  const propTop=new THREE.Vector3().fromArray(hoodLiner.userData.propSocket).applyMatrix4(hood.pivot.matrix);
  const prop=rod(iron,v(-.56,.60,1.68),propTop,.0045);scene.remove(prop);hero.add(prop);prop.name='Bonnet prop rod';
  for(const p of [{x:-4.8,z:-4.8,ry:Math.PI},{x:-5.25,z:2.5,ry:-Math.PI/2},{x:3.8,z:-1.8,ry:Math.PI}]){const w=props.create('workshop');w.position.set(p.x,0,p.z);w.rotation.y=p.ry;scene.add(w);}
  const vending=props.create('vending');vending.position.set(5.2,0,-5.05);vending.rotation.y=Math.PI;scene.add(vending);
  const wallSteel=steel('#e1e2e4',.88),frameSteel=steel('#b5bed1',.69);
  wallSteel.userData.illustratedArchitecture=frameSteel.userData.illustratedArchitecture=true;
  scene.traverse(o=>{if(o instanceof THREE.Mesh){if(o.material===wall)o.material=wallSteel;else if(o.material===beam)o.material=frameSteel;}});
  await scannedSurfacesReady();await document.fonts.ready;
  refineParkedHeadlamps(scene);
  softShadows.apply(scene);
  // These parked cars each see the actual nearby workshop. Capture once before
  // source painting, with cars and the floor mirror excluded from recursion.
  const parkedCars=fleet.slice(0,placements.length).map(car=>car.group);
  parkedCars.forEach((car,index)=>{
    const capture=captureGarageCarReflections(renderer,scene,
      [car,...parkedCars.filter((_,other)=>other!==index)],[reflector]);
    carReflectionCaptures.push(capture);
    const seen=new Set<THREE.Material>();
    car.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const material=object.material;
      if(!(material instanceof THREE.MeshStandardMaterial)||seen.has(material)
        || !['Primary','Windows'].includes(material.name))return;
      seen.add(material);
      reflectedCarMaterials.push({material,texture:capture.texture,source:material.envMap,intensity:material.envMapIntensity});
      material.envMapRotation.set(0,0,0);
    });
  });
  localReflections.setEnabled(true);
  // The freestanding engine sees the same workshop from its own height.
  // Exclude both cars as well as the engine and mirror during this capture.
  const engineCapture=captureGarageCarReflections(renderer,scene,
    [displayedEngine,...parkedCars],[reflector],new THREE.Vector3(0,.35,0));
  engineReflectionCaptures.push(engineCapture);
  const seenEngineMaterials=new Set<THREE.Material>();
  displayedEngine.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof THREE.MeshStandardMaterial)||seenEngineMaterials.has(material)
        ||material.metalness<=.45)continue;
      seenEngineMaterials.add(material);
      reflectedEngineMaterials.push({material,texture:engineCapture.texture,source:material.envMap,
        intensity:material.envMapIntensity,rotation:material.envMapRotation.clone()});
    }
  });
  engineReflections.setEnabled(true);
  const glazingMeshes=glazing.apply(scene);
  pass.setGlazingMeshes(glazingMeshes);
  const workshopEdgeTopology=materialStudy?prepareWorkshopEdgePaint(scene):null;
  illustratedMaterials.setWorkshopEdgeStrength(materialStudy?1:0);
  if(materialStudy)illustratedMaterials.apply(scene);else paintedSurfaces.apply(scene);
  clusteredLighting.apply(scene);
  applyMaterialPaint();
  ready=true;document.querySelector<HTMLElement>('#loading')!.style.display='none';canvas.dataset.ready='true';
  scene.updateMatrixWorld(true);render();
  const stats=()=>{let triangles=0,count=0;scene.traverse(o=>{if(o instanceof THREE.Mesh){count++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof THREE.InstancedMesh?o.count:1)}});return {ready,pixel,painted,grouping,contours,lighting:clusteredLighting.stats(),linework:pass.linework.stats(),clusters:pass.clusters.stats(),meshes:count,triangles,reflectionProbes:carReflectionCaptures.map(c=>({position:c.position.toArray(),resolution:c.resolution})),engineReflectionProbes:engineReflectionCaptures.map(c=>({position:c.position.toArray(),resolution:c.resolution})),camera:camera.position.toArray(),target:controls.target.toArray(),glError:renderer.getContext().getError()};};
  Object.assign(window,{garagePOC:{scene,camera,renderer,controls,pass,clusteredLighting,paintedSurfaces,illustratedMaterials,paintedFloor,softShadows,localReflections,engineReflections,glazing,shoreline,hood,engineBay,enamelTopology,workshopEdgeTopology,paintedAprons,render,stats,freeze:(value=true)=>{frozen=value;},reset},render_game_to_text:()=>JSON.stringify(stats()),advanceTime:(ms:number)=>{for(let i=0;i<Math.max(1,Math.round(ms/(1000/60)));i++)controls.update(1/60);render();}});
}
load().catch(error=>{console.error(error);document.querySelector<HTMLElement>('#loading')!.textContent=`Scene failed to load: ${error.message}`;canvas.dataset.ready='failed';});
