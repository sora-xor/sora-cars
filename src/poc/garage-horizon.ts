import * as THREE from 'three';
import { linearHdrForDisplayPigment } from './illustrated-pigments';

const lakeLevel=-4.22;
const hash=(n:number)=>THREE.MathUtils.euclideanModulo(Math.sin(n*127.1+311.7)*43758.5453,1);

type TerrainPigments=readonly [string,string,string,string,string,string];

/** Display pigments are calibrated through the same ACES transform as the garage. */
function terrainMaterial(pigments:TerrainPigments,haze:string,hazeAmount:number,fluted=false) {
  return new THREE.ShaderMaterial({
    name:'Distant terrain directional pigment',
    uniforms:{pigments:{value:pigments.map(color=>linearHdrForDisplayPigment(color))},
      hazeColor:{value:linearHdrForDisplayPigment(haze)},hazeAmount:{value:hazeAmount},
      fluted:{value:fluted?1:0},pigmentGrouping:{value:1}},
    vertexShader:`varying vec3 terrainPosition;varying vec3 terrainNormal;
      void main(){terrainPosition=(modelMatrix*vec4(position,1.)).xyz;
      terrainNormal=mat3(modelMatrix)*normal;
      gl_Position=projectionMatrix*viewMatrix*vec4(terrainPosition,1.);}`,
    fragmentShader:`uniform vec3 pigments[6],hazeColor;uniform float hazeAmount,fluted,pigmentGrouping;
      varying vec3 terrainPosition;varying vec3 terrainNormal;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
      void main(){vec3 n=normalize(terrainNormal);
        float light=clamp(dot(n,normalize(vec3(-.72,.42,.31)))*.68+.27,0.,1.);
        vec2 p=terrainPosition.xz;
        float pigment=noise(p*vec2(.23,.56))-.5;
        float fine=noise(p*vec2(1.4,2.3))-.5;
        float lod=1.-smoothstep(.5,1.4,max(fwidth(p.x*1.4),fwidth(p.y*2.3)));
        vec2 radial=vec2(p.x+47.,(p.y+174.)*1.18);
        float radius=length(radial),angle=atan(radial.y,radial.x);
        // Small patches follow the mountain's slope, with broken rather than continuous ridges.
        vec2 flow=vec2(angle*27.,radius*.39);
        float drift=noise(flow*.32)*.8;
        float ridgePaint=noise(flow*vec2(1.4,.36)+vec2(drift,0.));
        float brokenRidge=smoothstep(.59,.84,ridgePaint)*(noise(flow*vec2(.8,1.9))*.65+.35);
        float flowLod=1.-smoothstep(.65,1.5,max(fwidth(flow.x*1.4),fwidth(flow.y*1.9)));
        // Small surface-attached marks break lighting boundaries without filling every face with noise.
        light=clamp(light+pigment*.035+fine*.012*lod+(brokenRidge-.16)*fluted*.07*flowLod,0.,1.);
        float width=clamp(fwidth(light)*.7,.008,.025);
        vec3 color=pigments[0];
        color=mix(color,pigments[1],smoothstep(.18-width,.18+width,light));
        color=mix(color,pigments[2],smoothstep(.35-width,.35+width,light));
        color=mix(color,pigments[3],smoothstep(.53-width,.53+width,light));
        color=mix(color,pigments[4],smoothstep(.72-width,.72+width,light));
        color=mix(color,pigments[5],smoothstep(.88-width,.88+width,light));
        // Diagnostic blend isolates the grouped shapes from the calibrated colour correction.
        vec3 continuous=pigments[0];
        for(int i=0;i<5;i++)continuous=mix(continuous,pigments[i+1],clamp(light*5.-float(i),0.,1.));
        color=mix(continuous,color,pigmentGrouping);
        color=mix(color,hazeColor,hazeAmount);
        gl_FragColor=vec4(color,1.);
      }`,
  });
}

function terrain(width:number,depth:number,z:number,segmentsX:number,segmentsZ:number,
  height:(x:number,z:number)=>number,material:THREE.Material,name:string) {
  const geometry=new THREE.PlaneGeometry(width,depth,segmentsX,segmentsZ);geometry.rotateX(-Math.PI/2);
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)-60,worldZ=p.getZ(i)+z;
    p.setXYZ(i,x,lakeLevel+height(x,worldZ),worldZ);
  }
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;
}

/** Actual 3D ranges, shoreline and lake behind the garage; no scenic image planes. */
export function createGarageHorizon() {
  const group=new THREE.Group();group.name='Garage distant terrain and water';
  // Authored around the cutscene's indigo/violet ranges, rather than multiplied gray PBR colors.
  const haze='#60478d';
  const far=terrainMaterial(['#343079','#403586','#4c3b91','#5b4499','#6c4e9e','#7c5ba3'],haze,.12);
  const mountain=terrainMaterial(['#2c246d','#352b81','#403192','#513492','#643c96','#805096'],haze,.04,true);
  const middle=terrainMaterial(['#24255d','#2b286f','#322b81','#3b318c','#493b96','#5c4699'],haze,.025);
  const near=terrainMaterial(['#171e3f','#1e2350','#272568','#302b77','#3a3283','#493b8b'],haze,0);

  // Different depth and value for each range keep the lake valley open in the garage view.
  group.add(terrain(420,48,-227,250,24,(x,z)=>{
    const crest=3.6+1.8*Math.sin(x*.059+.7)+1.2*Math.sin(x*.137)+.55*Math.sin(x*.32);
    return -.12+Math.max(.25,crest)*Math.pow(Math.max(0,1-Math.abs(z+227)/24),1.4);
  },far,'Far violet ridge range'));
  group.add(terrain(330,118,-176,340,140,(x,z)=>{
    const dx=x+47,dz=(z+174)*1.18,r=Math.hypot(dx,dz),angle=Math.atan2(dz,dx);
    const profile=Math.pow(Math.max(0,1-Math.max(r,.9)/38),1.43)*15.1;
    const branch=angle+.026*Math.sin(r*.21+Math.sin(angle*7));
    const flutes=(Math.sin(branch*37+r*.019)*.17+Math.sin(branch*61-.7)*.07
      +Math.sin(branch*17+1.8)*.13)*Math.sin(Math.min(1,r/38)*Math.PI);
    const wornRidges=.09*Math.sin(x*.71+z*.27)*Math.sin(z*.53-x*.24);
    return -.12+Math.max(0,profile+flutes+wornRidges*Math.min(1,profile*.3));
  },mountain,'Fuji cone with radial eroded flutes'));
  group.add(terrain(380,29,-143,290,30,(x,z)=>{
    const winding=z+143+Math.sin(x*.086)*3.4;
    const crest=1.15+2.35*Math.pow(Math.abs(Math.sin(x*.066+Math.sin(x*.17)*.24)),1.8)
      +.67*Math.sin(x*.21-.5)+.29*Math.sin(x*.57);
    const ridge=Math.max(.45,crest)*Math.pow(Math.max(0,1-Math.abs(winding)/11),1.55);
    const subsidiary=(.9+.8*Math.sin(x*.117+1.7))*Math.pow(Math.max(0,1-Math.abs(winding-5.5)/7.5),1.3);
    const rock=.13*Math.sin(x*.87+z*.56)*Math.sin(x*.29-z*.36);
    return -.08+Math.max(ridge,subsidiary)+rock*Math.min(1,ridge);
  },middle,'Separated blue foothills'));
  group.add(terrain(360,24,-116,290,26,(x,z)=>{
    const winding=z+116+Math.sin(x*.098+.8)*2.2;
    const crest=.72+.65*Math.sin(x*.084)+.42*Math.sin(x*.205+1.2)+.21*Math.sin(x*.46);
    const ridge=Math.max(.20,crest)*Math.pow(Math.max(0,1-Math.abs(winding)/9.5),1.6);
    return -.035+ridge+.10*Math.sin(x*.92+z*.43)*Math.sin(x*.28-z*.35)*Math.min(1,ridge);
  },near,'Low wooded lakeshore ridges'));

  const waterMaterial=new THREE.ShaderMaterial({
    name:'Distant lake horizontal pigment and shore glints',
    uniforms:{deep:{value:new THREE.Color('#2b3766')},sky:{value:new THREE.Color('#575b91')},
      rose:{value:new THREE.Color('#ae6d9a')},gold:{value:new THREE.Color('#d7a67f')}},
    vertexShader:`varying vec3 waterPosition;void main(){waterPosition=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(waterPosition,1.);}`,
    fragmentShader:`uniform vec3 deep,sky,rose,gold;varying vec3 waterPosition;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=waterPosition.xz;
        vec2 q=p*vec2(.52,2.1);float brush=h(floor(q));
        float lod=1.-smoothstep(.6,1.7,max(fwidth(q.x),fwidth(q.y)));
        float ripple=mix(.30,smoothstep(.45,.79,brush),lod);
        float distanceTint=1.-smoothstep(-112.,-16.,p.y);
        vec3 color=mix(deep,sky,.12+distanceTint*.35+ripple*.18);
        float longMark=h(vec2(floor(p.x*.25),floor(p.y*1.6)));
        float roseMark=smoothstep(.84,.98,longMark)*(.45+.55*sin(p.x*.087+p.y*.021));
        color=mix(color,rose,roseMark*.23*lod);
        // Sparse broken reflections live below the far shore, never screen-space noise.
        float shore=exp(-pow((p.y+93.)/17.,2.));
        float windows=step(.85,h(vec2(floor(p.x*.84),17.)));
        float sparkle=smoothstep(.85,.98,brush)*windows*shore*lod;
        color=mix(color,gold,sparkle*.58);
        gl_FragColor=vec4(color,1.);}`,
  });
  const water=new THREE.Mesh(new THREE.PlaneGeometry(430,250),waterMaterial);
  water.rotation.x=-Math.PI/2;water.position.set(-60,lakeLevel,-132);
  water.name='Visible blue-violet lake with broken warm glints';group.add(water);

  // A compact strip of actual buildings and tiny emissive window blocks supplies scale.
  // Three instanced draws keep this distant detail inexpensive, including in reflections.
  const bodyMaterial=new THREE.MeshBasicMaterial({color:'#303b5c'});
  const roofMaterial=new THREE.MeshBasicMaterial({color:'#424766'});
  const lightMaterial=new THREE.MeshBasicMaterial({color:'#e2b18c'});
  const bodyTransforms:THREE.Matrix4[]=[],roofTransforms:THREE.Matrix4[]=[],lightTransforms:THREE.Matrix4[]=[];
  const transform=new THREE.Object3D();
  function instance(into:THREE.Matrix4[],x:number,y:number,z:number,w:number,h:number,d:number){
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.updateMatrix();into.push(transform.matrix.clone());
  }
  for(let i=0;i<142;i++){
    if(hash(i+433)<.10)continue;
    const settlement=Math.floor(i/12),local=i%12;
    const x=-177+settlement*21+local*(.75+hash(settlement+89)*.39)+hash(i+41)*.8;
    const z=-100-hash(settlement+171)*4.5-hash(i+28)*4.7;
    const w=.48+hash(i+5)*1.08,h=.22+Math.pow(hash(i+7),2)*.92,d=.46+hash(i+11)*.65;
    const ground=lakeLevel+.035;
    instance(bodyTransforms,x,ground+h*.5,z,w,h,d);
    instance(roofTransforms,x,ground+h+.032,z,w*1.08,.065,d*1.08);
    const columns=Math.max(1,Math.floor(w/.27));
    for(let j=0;j<columns;j++){
      if(hash(i*11+j+2)<.27)continue;
      instance(lightTransforms,x-w*.33+(j+.5)*w*.66/columns,ground+h*.52,z+d*.5+.011,.065+hash(i+j)*.035,.065,.025);
      if(h>.6&&hash(i+j+99)>.35)
        instance(lightTransforms,x-w*.33+(j+.5)*w*.66/columns,ground+h*.80,z+d*.5+.011,.075,.065,.025);
    }
    if(i%5===0)instance(lightTransforms,x+.6,ground+.16,z+1.1,.07,.08,.07);
  }
  const cube=new THREE.BoxGeometry(1,1,1);
  for(const [name,material,transforms] of [
    ['Lakeshore small buildings',bodyMaterial,bodyTransforms],
    ['Lakeshore roof edges',roofMaterial,roofTransforms],
    ['Sparse warm lakeshore windows',lightMaterial,lightTransforms],
  ] as const){
    const batch=new THREE.InstancedMesh(cube,material,transforms.length);batch.name=name;
    transforms.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingBox();batch.computeBoundingSphere();group.add(batch);
  }
  return group;
}
