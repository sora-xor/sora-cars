import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createShorelineLeaf } from './shoreline-leaf';

function bankHeight(x:number,z:number){
  const t=THREE.MathUtils.smoothstep(z,-18,-12.5);
  const relief=(Math.sin(x*1.8+z*.7)*Math.sin(z*2.4-x*.42)*.06+Math.sin(x*.8)*.05)*(1-t);
  const coastX=x+Math.sin(z*.73)*.65;
  const edge=THREE.MathUtils.smoothstep(coastX,-23.3,-20)
    *(1-THREE.MathUtils.smoothstep(coastX,10,13.3))
    *THREE.MathUtils.smoothstep(z+Math.sin(x*.8)*.40,-32.1,-28.8);
  return THREE.MathUtils.lerp(-4.50,-4.06+t*4.04+relief,edge);
}

/** Geometry supplies the canopy gaps; the shader only paints existing leaves. */
export function createGarageShoreline(){
  const group=new THREE.Group();group.name='Layered maple shoreline';
  const painted={value:1};
  const leaves=new THREE.MeshStandardMaterial({
    name:'Shoreline folded maple pigment',color:'#ffffff',roughness:.91,
    metalness:0,side:THREE.DoubleSide,
  });
  leaves.userData.garageLeafPaint=true;
  leaves.onBeforeCompile=shader=>{
    shader.uniforms.shoreLeafPaint=painted;
    shader.vertexShader=`attribute vec2 leafPaintData;varying vec2 vLeafPaintData;varying vec2 vLeafUv;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vLeafPaintData=leafPaintData;vLeafUv=uv;
    `);
    shader.fragmentShader=/* glsl */`
      uniform float shoreLeafPaint;varying vec2 vLeafPaintData;varying vec2 vLeafUv;
      float leafHash(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.103,.0973));
        q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      vec2 leafBrushUv=vLeafUv*vec2(9.,15.);
      float leafFootprint=max(length(dFdx(leafBrushUv)),length(dFdy(leafBrushUv)));
      float leafResolve=1.-smoothstep(.35,1.3,leafFootprint);
      float leafDab=mix(.5,leafHash(floor(leafBrushUv)+vLeafPaintData.x*31.),leafResolve);
      float leafAxis=abs(vLeafUv.x-.5);
      float leafAa=max(fwidth(leafAxis),.003);
      float leafVein=1.-smoothstep(.004-leafAa,.01+leafAa,leafAxis);
      leafVein*=smoothstep(.05,.25,vLeafUv.y)*(1.-smoothstep(.80,.98,vLeafUv.y));
      // Per-leaf exposure describes its place inside the real branch crown.
      // The actual incoming illumination still determines brightness and hue.
      vec3 leafPigment=mix(vec3(.82,.89,1.12),vec3(1.13,.93,.99),vLeafPaintData.x);
      float leafWear=(leafDab-.5)*.16+leafVein*.10*leafResolve;
      diffuseColor.rgb*=mix(vec3(1.),leafPigment*(1.+leafWear),shoreLeafPaint);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',/* glsl */`
      #include <lights_fragment_end>
      vec3 leafRadiance=reflectedLight.directDiffuse+reflectedLight.indirectDiffuse;
      float leafEnergy=dot(leafRadiance,vec3(.2126,.7152,.0722));
      float leafAlbedo=max(dot(material.diffuseColor,vec3(.2126,.7152,.0722)),.025);
      float leafIncident=leafEnergy/leafAlbedo;
      float leafLevel=log2(1.+leafIncident*3.)*3.2+(vLeafPaintData.x-.5)*.30;
      float leafWidth=fwidth(leafLevel),leafAA=clamp(leafWidth*.7,.045,.22);
      float leafBand=floor(leafLevel)+smoothstep(.43-leafAA,.57+leafAA,fract(leafLevel));
      float leafGrouped=(exp2(max(0.,leafBand)/3.2)-1.)/3.;
      float leafGain=clamp(leafGrouped/max(leafIncident,.0001),.78,1.3);
      float leafAmount=shoreLeafPaint*.64*smoothstep(.001,.008,leafEnergy)
        *(1.-smoothstep(.4,1.2,leafWidth));
      reflectedLight.directDiffuse*=mix(1.,leafGain,leafAmount);
      // Crown interiors receive less sky than exposed outer branchlets.
      reflectedLight.indirectDiffuse*=mix(1.,mix(.48,1.,vLeafPaintData.y),shoreLeafPaint)
        *mix(1.,leafGain,leafAmount);
    `);
  };
  leaves.customProgramCacheKey=()=> 'garage-shoreline-leaf-v1';
  const bark=new THREE.MeshStandardMaterial({name:'Twisted maple bark',color:'#3e3540',roughness:.96});
  const leafGeometry=createShorelineLeaf();
  const placements=[
    {x:-13.4,z:-21,height:8.1,width:5.2,depth:4.4,seed:19},
    {x:-11.1,z:-19,height:4.8,width:3.5,depth:2.8,seed:43},
    {x:2.4,z:-24,height:6,width:4.6,depth:3.8,seed:91},
  ];
  for(const [treeIndex,p] of placements.entries()){
    let seed=p.seed;
    const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return (seed>>>0)/4294967296;};
    const tree=new THREE.Group();tree.name=`Shoreline maple ${treeIndex+1}`;
    tree.position.set(p.x,bankHeight(p.x,p.z)-.055,p.z);
    const branchGeometry:THREE.BufferGeometry[]=[];
    const leafMatrices:THREE.Matrix4[]=[],leafSeeds:number[]=[],leafColors:THREE.Color[]=[];
    const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1);
    const colorA=new THREE.Color('#41435f'),colorB=new THREE.Color('#9593a3');
    function branch(a:THREE.Vector3,b:THREE.Vector3,r0:number,r1:number){
      const length=a.distanceTo(b);if(length<.0001)return;
      const geometry=new THREE.CylinderGeometry(r1,r0,length,r0>.03?10:6,2);
      const q=new THREE.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize());
      geometry.applyMatrix4(new THREE.Matrix4().compose(a.clone().lerp(b,.5),q,new THREE.Vector3(1,1,1)));
      branchGeometry.push(geometry);
    }
    const trunk:THREE.Vector3[]=[];
    for(let i=0;i<=7;i++){
      const t=i/7;
      trunk.push(new THREE.Vector3(Math.sin(t*2.8+p.seed)*p.width*.055*t,
        t*p.height*.80,Math.sin(t*3.7)*p.depth*.06));
      if(i)branch(trunk[i-1]!,trunk[i]!,p.height*.025*(1-t*.85),p.height*.025*(1-t*.98));
    }
    // Several rooted toes avoid a trunk terminating as a vertical cylinder.
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+random()*.3;
      branch(new THREE.Vector3(Math.cos(angle)*.52,.01,Math.sin(angle)*.48),trunk[1]!,p.height*.013,p.height*.011);
    }
    for(let limb=0;limb<10;limb++){
      const limbTone=random();
      const angle=limb*2.39996+random()*.35;
      const t=.40+limb*.047;
      const start=trunk[Math.min(6,Math.floor(t*7))]!.clone();
      const extent=(.68+random()*.30)*(limb>7?.62:1.);
      const end=new THREE.Vector3(Math.cos(angle)*p.width*.34*extent,
        p.height*(.51+limb*.039+random()*.075),Math.sin(angle)*p.depth*.34*extent);
      const bend=start.clone().lerp(end,.50);bend.y+=p.height*.055;
      branch(start,bend,p.height*.013*(1-limb*.055),p.height*.008);
      branch(bend,end,p.height*.008,p.height*.003);
      for(let twig=0;twig<7;twig++){
        const a=angle+(random()-.5)*1.9;
        const stem=bend.clone().lerp(end,.25+random()*.70);
        const reach=p.width*(.08+random()*.08);
        const tip=stem.clone().add(new THREE.Vector3(Math.cos(a)*reach,
          p.height*(.01+random()*.065),Math.sin(a)*reach*.80));
        branch(stem,tip,p.height*.0029,p.height*.00065);
        const radius=p.width*(.10+random()*.025);
        // Randomized positions fill small twig sprays, leaving gaps between
        // limbs. Every silhouette fragment is an actual folded palmate leaf.
        for(let leaf=0;leaf<65;leaf++){
          const azimuth=random()*Math.PI*2,cosTheta=random()*2-1;
          const sinTheta=Math.sqrt(1-cosTheta*cosTheta),r=Math.cbrt(random());
          const offset=new THREE.Vector3(Math.cos(azimuth)*sinTheta*r*radius,
            cosTheta*r*radius*.70,Math.sin(azimuth)*sinTheta*r*radius*.82);
          const position=tip.clone().lerp(stem,random()*.55).add(offset);
          const normal=new THREE.Vector3((random()-.5)*1.7,.30+random(),(random()-.5)*1.7).normalize();
          transform.position.copy(position);
          transform.quaternion.setFromUnitVectors(forward,normal);
          transform.rotateZ(random()*Math.PI*2);
          const size=(.12+random()*.12)*(p.width/5.2);
          transform.scale.set(size*(.75+random()*.30),size,size);
          transform.updateMatrix();leafMatrices.push(transform.matrix.clone());
          const tone=random(),exposure=THREE.MathUtils.clamp(.20+r*.60+offset.y/radius*.22,0,1);
          leafSeeds.push(tone,exposure);
          leafColors.push(colorA.clone().lerp(colorB,exposure*.48+limbTone*.29+tone*.08));
        }
      }
    }
    const merged=mergeGeometries(branchGeometry);branchGeometry.forEach(g=>g.dispose());
    if(merged){const wood=new THREE.Mesh(merged,bark);wood.name='Continuous trunk, limbs and tapered twigs';wood.castShadow=wood.receiveShadow=true;tree.add(wood);}
    const treeLeaves=leafGeometry.clone();
    treeLeaves.setAttribute('leafPaintData',new THREE.InstancedBufferAttribute(new Float32Array(leafSeeds),2));
    const canopy=new THREE.InstancedMesh(treeLeaves,leaves,leafMatrices.length);canopy.name='Individually folded palmate leaves';
    leafMatrices.forEach((matrix,index)=>{canopy.setMatrixAt(index,matrix);canopy.setColorAt(index,leafColors[index]!);});
    canopy.instanceMatrix.needsUpdate=true;if(canopy.instanceColor)canopy.instanceColor.needsUpdate=true;
    canopy.computeBoundingBox();canopy.computeBoundingSphere();canopy.receiveShadow=true;
    // Full silhouettes are opaque geometry, so beauty/depth/reflection agree.
    canopy.castShadow=true;tree.add(canopy);group.add(tree);
  }
  leafGeometry.dispose();
  const bankGeometry=new THREE.PlaneGeometry(38,20,92,42);bankGeometry.rotateX(-Math.PI/2);
  const bankPositions=bankGeometry.attributes.position;
  for(let i=0;i<bankPositions.count;i++){
    const x=bankPositions.getX(i)-5,z=bankPositions.getZ(i)-22.5;
    bankPositions.setXYZ(i,x,bankHeight(x,z),z);
  }
  bankGeometry.computeVertexNormals();
  const bank=new THREE.Mesh(bankGeometry,new THREE.MeshStandardMaterial({name:'Vegetated shore earth',color:'#252936',roughness:1}));
  bank.name='Sloping real shoreline below the garage';bank.castShadow=bank.receiveShadow=true;group.add(bank);
  return {group,setPainted(enabled:boolean){painted.value=enabled?1:0;}};
}
