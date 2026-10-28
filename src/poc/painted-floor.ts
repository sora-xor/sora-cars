import * as THREE from 'three';
import { workshopConcreteShader } from './workshop-concrete';
import { linearHdrForDisplayPigment } from './illustrated-pigments';

/** Shared by the real floor and its reflected-image mask, in world metres. */
export const concreteFieldShader=/* glsl */`
  vec2 concreteHash(vec2 p){
    vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
    q+=dot(q,q.yzx+33.33);
    return fract((q.xx+q.yz)*q.zy);
  }
  float concreteField(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(concreteHash(i).x,concreteHash(i+vec2(1,0)).x,f.x),
      mix(concreteHash(i+vec2(0,1)).x,concreteHash(i+vec2(1,1)).x,f.x),f.y);
  }
`;

/** One attached paint field for floor colour boundaries, gloss and mirror coverage. */
export const concreteStrokeCoverageShader=/* glsl */`
  uniform sampler2D garageConcreteStrokeMap;
  uniform float garageConcreteStrokeReady;
  uniform float garageConcreteCoverage;
  float concreteCoverageBlend(){
    return clamp(garageConcreteCoverage,0.,1.)*garageConcreteStrokeReady;
  }
  vec2 concreteStrokeSample(vec2 worldXZ){
    // The existing chisel painting runs along the workshop's X axis. These
    // metre-based coordinates are identical in the main and reflected views.
    vec2 tile=vec2(6.4,3.2),uv=worldXZ/tile;
    vec2 worldDx=dFdx(worldXZ),worldDy=dFdy(worldXZ);
    // A 2.5cm minimum footprint removes the asset's fine dry-brush grain while
    // keeping its connected angular strokes. Derivatives stay continuous at
    // every repeat; four shifted samples hide the source image's tile border.
    vec2 dx=worldDx/tile*max(1.,.025/max(length(worldDx),.0001));
    vec2 dy=worldDy/tile*max(1.,.025/max(length(worldDy),.0001));
    vec2 local=fract(uv);
    vec2 shift=1.-smoothstep(vec2(.025),vec2(.09),min(local,1.-local));
    float a=textureGrad(garageConcreteStrokeMap,uv,dx,dy).r;
    float b=textureGrad(garageConcreteStrokeMap,uv+vec2(.5,0.),dx,dy).r;
    float c=textureGrad(garageConcreteStrokeMap,uv+vec2(0.,.5),dx,dy).r;
    float d=textureGrad(garageConcreteStrokeMap,uv+vec2(.5,.5),dx,dy).r;
    float raw=mix(mix(a,b,shift.x),mix(c,d,shift.x),shift.y);
    // The achromatic data texture's measured median is 116/255, not .5.
    float mark=clamp(.5+(raw-.45490196)*2.,0.,1.);
    float aa=clamp(fwidth(mark)*.75,.015,.12);
    float islands=smoothstep(.45-aa,.62+aa,mark);
    // Unresolved strokes converge to their approximate filtered area coverage,
    // rather than disappearing when the mip mean falls below the threshold.
    float resolved=1.-smoothstep(.06,.20,max(length(worldDx),length(worldDy)));
    return vec2(mix(.5,mark,resolved),mix(.37,islands,resolved));
  }
`;

/** Concrete paint structure is evaluated on the actual floor in both cameras. */
export function createPaintedFloor(material: THREE.MeshStandardMaterial) {
  // This material owns its paint response; avoid a second generic light
  // quantizer stacking unrelated noise over the authored concrete strokes.
  material.userData.garagePaintedFloor=true;
  const strength={value:1};
  const authoredTexture:{value:THREE.Texture|null}={value:null};
  const authoredStrength={value:0},authoredScale={value:5.2};
  const lightPaintStrength={value:1};
  // Opt-in study: root compares this material against the previous floor before
  // adopting it. These are sampled floor pigments from garage-wide-v2.png,
  // calibrated for the POC's exposure=1 ACES output (not final-frame grading).
  const illustratedStrength={value:0},illustratedLightScale={value:1};
  const underpaintingStrength={value:1};
  // Independent opt-in: choose painted colours inside an illuminated band,
  // without changing the shared roughness/reflection coverage field.
  const interiorStrength={value:0};
  const coverageUniforms={
    garageConcreteStrokeMap:{value:null as THREE.Texture|null},
    garageConcreteStrokeReady:{value:0},
    garageConcreteCoverage:{value:1},
  };
  const illustratedCool={value:['#211e2b','#363240','#524453','#6d5867','#866e81','#a3858f']
    .map(hex=>linearHdrForDisplayPigment(hex))};
  const illustratedWarm={value:['#312825','#52413b','#725e4b','#ab8059','#d79d5a','#f1c07d']
    .map(hex=>linearHdrForDisplayPigment(hex))};
  const illustratedEdges={value:[.07,.22,.60,1.45,3.1].map(energy=>Math.log2(1.+energy*3.))};
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.garageConcretePaint=strength;
    shader.uniforms.garageConcreteAuthoredMap=authoredTexture;
    shader.uniforms.garageConcreteAuthored=authoredStrength;
    shader.uniforms.garageConcreteTileMetres=authoredScale;
    shader.uniforms.garageConcreteLightPaint=lightPaintStrength;
    shader.uniforms.garageConcreteIllustrated=illustratedStrength;
    shader.uniforms.garageConcreteIllustratedLightScale=illustratedLightScale;
    shader.uniforms.garageConcreteUnderpainting=underpaintingStrength;
    shader.uniforms.garageConcreteInterior=interiorStrength;
    shader.uniforms.garageConcreteCool=illustratedCool;
    shader.uniforms.garageConcreteWarm=illustratedWarm;
    shader.uniforms.garageConcreteEdges=illustratedEdges;
    Object.assign(shader.uniforms,coverageUniforms);
    shader.vertexShader=`varying vec3 garageConcretePosition;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      garageConcretePosition=(modelMatrix*vec4(transformed,1.)).xyz;
    `);
    shader.fragmentShader=/* glsl */`
      varying vec3 garageConcretePosition;
      uniform float garageConcretePaint;
      uniform sampler2D garageConcreteAuthoredMap;
      uniform float garageConcreteAuthored;
      uniform float garageConcreteTileMetres;
      uniform float garageConcreteLightPaint;
      uniform float garageConcreteIllustrated;
      uniform float garageConcreteIllustratedLightScale;
      uniform float garageConcreteUnderpainting;
      uniform float garageConcreteInterior;
      uniform vec3 garageConcreteCool[6];
      uniform vec3 garageConcreteWarm[6];
      uniform float garageConcreteEdges[5];
      ${concreteFieldShader}
      ${concreteStrokeCoverageShader}
      ${workshopConcreteShader}
      vec3 concretePaintRadiance(vec3 radiance,float albedo,float stroke,float amount){
        float energy=dot(radiance,vec3(.2126,.7152,.0722));
        float incident=energy/max(albedo,.02);
        float level=log2(1.+incident*2.)*3.4+(stroke-.5)*.72;
        float footprint=fwidth(level);
        float aa=clamp(footprint*.6,.045,.22);
        float band=floor(level)+smoothstep(.44-aa,.56+aa,fract(level));
        float grouped=(exp2(max(0.,band)/3.4)-1.)*.5;
        float gain=clamp(grouped/max(incident,.0001),.70,1.45);
        float resolved=1.-smoothstep(.45,1.25,footprint);
        float lit=smoothstep(.001,.008,energy);
        return radiance*mix(1.,gain,amount*resolved*lit);
      }
      float concreteSeam(vec2 p){
        vec2 cell=floor(p),f=fract(p);float nearest=10.,second=10.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 offset=vec2(float(x),float(y));
          vec2 r=offset+.22+.56*concreteHash(cell+offset)-f;
          float d=dot(r,r);
          if(d<nearest){second=nearest;nearest=d;}else second=min(second,d);
        }
        return (sqrt(second)-sqrt(nearest))*.5;
      }
      vec3 concreteLocalUnderpaint(vec2 p){
        // Same seamless authored map and coordinates as the main sample, with
        // an 8cm minimum footprint. The ratio to this local mean keeps real
        // painted texture at controlled contrast instead of flattening it away
        // or multiplying a dark photographic albedo over the palette twice.
        float tile=max(abs(garageConcreteTileMetres),.001);
        vec2 uv=p/tile,dx=dFdx(p),dy=dFdy(p);
        vec2 uvDx=dx/tile*max(1.,.08/max(length(dx),.0001));
        vec2 uvDy=dy/tile*max(1.,.08/max(length(dy),.0001));
        vec2 local=fract(uv);
        vec2 shift=1.-smoothstep(vec2(.025),vec2(.09),min(local,1.-local));
        vec3 a=textureGrad(garageConcreteAuthoredMap,uv,uvDx,uvDy).rgb;
        vec3 b=textureGrad(garageConcreteAuthoredMap,uv+vec2(.5,0.),uvDx,uvDy).rgb;
        vec3 c=textureGrad(garageConcreteAuthoredMap,uv+vec2(0.,.5),uvDx,uvDy).rgb;
        vec3 d=textureGrad(garageConcreteAuthoredMap,uv+vec2(.5,.5),uvDx,uvDy).rgb;
        return mix(mix(a,b,shift.x),mix(c,d,shift.x),shift.y);
      }
      float concreteBoundaryMark(vec2 p,float textureRatio){
        // No rectangular cell masks: actual pigment structure supplies the
        // transition edge. A gentle irregular mass prevents identical tiny
        // grain from determining every boundary, while staying object-attached.
        float irregular=concreteField(p*vec2(1.7,2.9)+vec2(13.,7.))*.7
          +concreteField(p*vec2(4.6,6.7)+vec2(3.,19.))*.3;
        return clamp(.5+(textureRatio-1.)*.55+(irregular-.5)*.22,0.,1.);
      }
      vec3 concreteIllustratedDiffuse(vec3 physicalDirect,vec3 physicalIndirect,
        vec3 albedo,float largeBrush,vec2 interiorStroke){
        vec3 total=max(vec3(0.),physicalDirect+physicalIndirect);
        float incident=dot(total,vec3(.2126,.7152,.0722))
          /max(dot(albedo,vec3(.2126,.7152,.0722)),.0001);
        vec3 irradiance=total/max(albedo,vec3(.001));
        float warmth=(irradiance.r-irradiance.b)
          /max(dot(irradiance,vec3(.2126,.7152,.0722)),.001);
        float warmWeight=smoothstep(-.18,.34,warmth);
        float level=log2(1.+incident*garageConcreteIllustratedLightScale*3.);
        float paintedLevel=level+(largeBrush-.5)*mix(.24,.45,concreteCoverageBlend());
        float aa=max(.04,mix(fwidth(level),fwidth(paintedLevel),concreteCoverageBlend())*.8);
        vec3 pigment=mix(garageConcreteCool[0],garageConcreteWarm[0],warmWeight);
        vec3 darkLoad=mix(garageConcreteCool[0],garageConcreteWarm[0],warmWeight*.15);
        vec3 warmLoad=mix(garageConcreteWarm[0],garageConcreteWarm[1],.45);
        for(int i=0;i<5;i++){
          float edge=smoothstep(garageConcreteEdges[i]-aa,
            garageConcreteEdges[i]+aa,paintedLevel);
          pigment=mix(pigment,mix(garageConcreteCool[i+1],garageConcreteWarm[i+1],warmWeight),edge);
          // Neighbouring actual paint colours supply contrast; no achromatic
          // brightness grain or additive light is introduced into the fill.
          vec3 coolBody=mix(garageConcreteCool[i+1],garageConcreteWarm[i+1],warmWeight*.15);
          vec3 nextDark=mix(coolBody,garageConcreteCool[i],.55);
          // Mix a deeper charcoal load into the same stroke. The stronger
          // two-stop version made repetitive dark rows; this midpoint keeps
          // quiet gaps and the concrete underpainting visible.
          nextDark=mix(nextDark,mix(coolBody,garageConcreteCool[max(i-1,0)],.85),.5);
          int catchIndex=min(i+2,5);
          vec3 nextWarm=mix(garageConcreteWarm[i+1],garageConcreteWarm[catchIndex],.45);
          darkLoad=mix(darkLoad,nextDark,edge);
          warmLoad=mix(warmLoad,nextWarm,edge);
        }
        // The existing field is already attached in world metres and resolves
        // to .5 at distance. Sparse low/high tails leave its quiet centre alone.
        // Filtering the mark itself also covers evenly illuminated surfaces.
        float mark=clamp(interiorStroke.x,0.,1.);
        float markFootprint=fwidth(mark);
        float markAA=clamp(markFootprint*.75,.015,.12);
        float markResolved=1.-smoothstep(.14,.40,markFootprint);
        float darkCoverage=(1.-smoothstep(.34-markAA,.49+markAA,mark))*markResolved;
        float warmCoverage=smoothstep(.56-markAA,.72+markAA,mark)
          *clamp(interiorStroke.y,0.,1.)*markResolved;
        float directEnergy=dot(max(physicalDirect,vec3(0.)),vec3(.2126,.7152,.0722));
        float totalEnergy=dot(total,vec3(.2126,.7152,.0722));
        float directShare=clamp(directEnergy/max(totalEnergy,.0001),0.,1.);
        float directIncident=directEnergy/max(dot(albedo,vec3(.2126,.7152,.0722)),.0001);
        warmCoverage*=directShare*warmWeight*smoothstep(.10,.65,directIncident);
        float interiorAmount=clamp(garageConcreteInterior,0.,1.)*garageConcreteStrokeReady;
        if(interiorAmount>0.){
          pigment=mix(pigment,darkLoad,darkCoverage*interiorAmount*.775);
          pigment=mix(pigment,warmLoad,warmCoverage*interiorAmount*.50);
        }
        // No emissive shadow floor: actual loss of light still goes to black.
        // Controlled local texture is restored by the caller after this ramp.
        return pigment*smoothstep(0.,.035,incident);
      }
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',/* glsl */`
      #include <map_fragment>
      vec3 concreteSourceColor=diffuseColor.rgb;
      vec3 concreteSourceBroad=diffuseColor.rgb;
      #ifdef USE_MAP
        // Resolve the scan as a broad material underpainting. A minimum 1.8 cm
        // footprint removes asphalt grit without a screen-fixed blur or a
        // camera-dependent explicit mip level; distant samples keep their LOD.
        vec2 concreteUvDx=dFdx(vMapUv),concreteUvDy=dFdy(vMapUv);
        float concreteWorldDx=max(length(dFdx(garageConcretePosition.xz)),.0001);
        float concreteWorldDy=max(length(dFdy(garageConcretePosition.xz)),.0001);
        concreteSourceBroad=diffuse*textureGrad(map,vMapUv,
          concreteUvDx*max(1.,.018/concreteWorldDx),
          concreteUvDy*max(1.,.018/concreteWorldDy)).rgb;
      #endif
      // The authored albedo already contains sharp paint marks. Keep its
      // natural footprint instead of applying the asphalt scan's broad filter.
      vec3 concreteAuthoredColor=diffuse*sampleWorkshopConcrete(
        garageConcreteAuthoredMap,garageConcretePosition.xz,garageConcreteTileMetres);
      diffuseColor.rgb=mix(diffuseColor.rgb,concreteAuthoredColor,garageConcreteAuthored);
      concreteSourceColor=diffuseColor.rgb;
      concreteSourceBroad=mix(concreteSourceBroad,concreteAuthoredColor,garageConcreteAuthored);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      vec2 concreteP=garageConcretePosition.xz;
      vec2 concreteStrokeField=concreteStrokeSample(concreteP);
      // Two-to-three metre quiet masses establish the worn floor. Smaller
      // variations disturb their boundaries, rather than filling every patch.
      float concreteMass=concreteField(concreteP*vec2(.38,.48))*.79
        +concreteField(concreteP*1.45+19.)*.21;
      float concreteWear=concreteField(concreteP*3.1+19.);
      float concreteMassEdge=1.-smoothstep(.035,.13,abs(concreteMass-.51));
      vec2 concreteBrushUv=concreteP*vec2(4.2,12.)
        +vec2(concreteMass*.8,concreteWear*.23);
      vec2 concreteBrushCell=floor(concreteBrushUv);
      vec2 concreteBrushRandom=concreteHash(concreteBrushCell);
      vec2 concreteBrushLocal=abs(fract(concreteBrushUv)-.5);
      float concreteBrushEdge=max(concreteBrushLocal.x-(.30+.15*concreteBrushRandom.x),
        concreteBrushLocal.y-(.16+.18*concreteBrushRandom.y));
      float concreteBrushAA=max(length(fwidth(concreteBrushUv))*.24,.025);
      float concreteDab=1.-smoothstep(-concreteBrushAA,concreteBrushAA,concreteBrushEdge);
      float concreteBrushLod=1.-smoothstep(.75,1.7,length(fwidth(concreteBrushUv)));
      float concreteDry=concreteDab*smoothstep(.30,.68,concreteBrushRandom.x)
        *concreteBrushLod;
      // Long cracked slabs are sparsely worn at their lips. Domain warping and
      // interrupted lengths avoid a pristine polygon-tile drawing.
      vec2 concreteCrackP=concreteP*.35
        +vec2(concreteField(concreteP*1.4)-.5,concreteField(concreteP*1.7+8.)-.5)*.075;
      float concreteGap=concreteSeam(concreteCrackP);
      float concreteSeamAA=max(length(fwidth(concreteCrackP))*.5,.0007);
      float concreteCrack=1.-smoothstep(.0016-concreteSeamAA,.0045+concreteSeamAA,concreteGap);
      concreteCrack*=smoothstep(.24,.42,concreteWear+concreteMass*.18);
      float concreteRim=(1.-smoothstep(.009-concreteSeamAA,.018+concreteSeamAA,concreteGap))
        *(1.-concreteCrack)*smoothstep(.41,.66,concreteWear);
      float concreteChips=concreteDry*max(.22+concreteMassEdge*.78,concreteRim);
      float concreteValue=mix(.92,1.38,smoothstep(.37,.64,concreteMass));
      concreteValue=mix(concreteValue,mix(.97,1.06,concreteMass),garageConcreteAuthored);
      vec3 concretePigment=mix(vec3(.93,.94,1.01),vec3(1.04,1.,.92),
        smoothstep(.39,.63,concreteMass));
      concretePigment=mix(concretePigment,vec3(1.),garageConcreteAuthored*.82);
      // Keep the scan's broad color and a small, localized sharp residual in
      // diagnostic scan mode. The authored map retains its original detail.
      vec3 concreteUnderpaint=concreteSourceBroad
        +(concreteSourceColor-concreteSourceBroad)*(.18+concreteChips*.24);
      concreteUnderpaint*=mix(vec3(1.),
        diffuseColor.rgb/max(concreteSourceColor,vec3(.001)),mix(.22,.05,garageConcreteAuthored));
      vec3 concretePaint=concreteUnderpaint*concreteValue*concretePigment;
      concretePaint*=1.-concreteCrack*mix(.62,.22,garageConcreteAuthored);
      concretePaint*=1.+(concreteRim*.16+concreteChips*.30)*mix(1.,.15,garageConcreteAuthored);
      diffuseColor.rgb=mix(diffuseColor.rgb,concretePaint,garageConcretePaint);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',/* glsl */`
      #include <roughnessmap_fragment>
      // Damp islands occupy the rare top of the same broad wear field. Most of
      // the floor stays matte; actual lights determine which islands reflect.
      float concreteDamp=smoothstep(.58,.75,concreteField(concreteP*.57+31.));
      concreteDamp*=mix(1.,concreteStrokeField.y,concreteCoverageBlend());
      roughnessFactor=mix(roughnessFactor,mix(.84,.43,concreteDamp),garageConcretePaint*.94);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',/* glsl */`
      #include <normal_fragment_maps>
      // Fine scanned relief remains strongest at the localized chipped marks.
      normal=normalize(mix(normal,nonPerturbedNormal,
        garageConcretePaint*mix(.67-concreteChips*.22,.87,garageConcreteAuthored)));
      // The photographic asphalt normal would carve grain into every new RGB
      // band. The illustrated floor uses its true plane, existing slab cracks
      // and damp roughness; the independent planar reflection remains intact.
      normal=normalize(mix(normal,nonPerturbedNormal,
        garageConcretePaint*garageConcreteIllustrated));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',/* glsl */`
      #include <lights_fragment_end>
      vec3 concretePhysicalDirect=reflectedLight.directDiffuse;
      vec3 concretePhysicalIndirect=reflectedLight.indirectDiffuse;
      float concreteAlbedo=max(dot(material.diffuseColor,vec3(.2126,.7152,.0722)),.02);
      float concreteDirectLight=dot(reflectedLight.directDiffuse,vec3(.2126,.7152,.0722))/concreteAlbedo;
      float concreteLightCatch=smoothstep(.14,.72,concreteDirectLight);
      float concreteMaterialMark=smoothstep(.10,.30,dot(
        concreteAuthoredColor/max(diffuse,vec3(.001)),vec3(.2126,.7152,.0722)));
      float concreteStroke=mix(concreteDry,concreteMaterialMark,garageConcreteAuthored);
      float concreteLightingBlend=garageConcretePaint*garageConcreteLightPaint;
      reflectedLight.directDiffuse=concretePaintRadiance(
        reflectedLight.directDiffuse,concreteAlbedo,concreteStroke,concreteLightingBlend*.88);
      reflectedLight.indirectDiffuse=concretePaintRadiance(
        reflectedLight.indirectDiffuse,concreteAlbedo,concreteStroke,concreteLightingBlend*.32);
      // Small broken amber catches are made from the real incoming light.
      // This never adds a baked pool of light or emits color from dark patches.
      float concreteLitChip=concreteChips*concreteLightCatch*garageConcretePaint
        *mix(1.,.18,garageConcreteAuthored);
      reflectedLight.directDiffuse*=mix(vec3(1.),vec3(1.50,1.34,1.10),concreteLitChip);
      reflectedLight.directSpecular*=1.+concreteLitChip*.55;
      if(garageConcreteIllustrated>0.){
        vec3 concreteLocalMean=mix(concreteSourceBroad,
          diffuse*concreteLocalUnderpaint(concreteP),garageConcreteAuthored);
        vec3 concreteTextureRatio=clamp(concreteSourceColor/max(concreteLocalMean,vec3(.001)),.4,2.2);
        float concreteBoundaryTone=dot(concreteTextureRatio,vec3(.2126,.7152,.0722));
        float concreteRampMark=mix(concreteBoundaryMark(concreteP,concreteBoundaryTone),
          concreteStrokeField.x,concreteCoverageBlend());
        vec3 concreteIllustrated=concreteIllustratedDiffuse(concretePhysicalDirect,
          concretePhysicalIndirect,material.diffuseColor,concreteRampMark,concreteStrokeField);
        // The pigment ramp replaces illumination, not the painted floor's
        // broad value shapes. Restore bounded underpainting separately from
        // the fine residual below. This is the existing authored texture's
        // 8 cm local mean relative to its measured linear-sRGB median.
        vec3 concreteNeutral=diffuse*vec3(.27467731,.25015828,.22322796);
        float concreteUnderpaintValue=dot(concreteLocalMean,vec3(.2126,.7152,.0722))
          /max(dot(concreteNeutral,vec3(.2126,.7152,.0722)),.001);
        float concreteUnderpaintGain=pow(clamp(concreteUnderpaintValue,.65,1.55),.45);
        concreteIllustrated*=mix(1.,concreteUnderpaintGain,
          garageConcreteAuthored*garageConcreteUnderpainting);
        // Retain 30% of the real pigment variation relative to its local
        // underpainting. This restores fine irregular detail without the full
        // grain of the original floor or the rejected vector-flat plateaus.
        concreteIllustrated*=mix(vec3(1.),concreteTextureRatio,.30);
        // Keep the sparse slab seams, while quiet interiors stay a coherent fill.
        // A small worn lip catches existing key light instead of emitting a line.
        concreteIllustrated*=1.-concreteCrack*.33;
        concreteIllustrated*=1.+concreteRim*concreteLightCatch*.09;
        float concretePhysicalEnergy=dot(concretePhysicalDirect+concretePhysicalIndirect,
          vec3(.2126,.7152,.0722));
        float concreteDirectFraction=clamp(dot(concretePhysicalDirect,vec3(.2126,.7152,.0722))
          /max(concretePhysicalEnergy,.000001),0.,1.);
        float concreteIllustratedBlend=garageConcretePaint*garageConcreteIllustrated;
        reflectedLight.directDiffuse=mix(reflectedLight.directDiffuse,
          concreteIllustrated*concreteDirectFraction,concreteIllustratedBlend);
        reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,
          concreteIllustrated*(1.-concreteDirectFraction),concreteIllustratedBlend);
      }
    `);
  };
  material.customProgramCacheKey=()=>`${previousKey}:garage-painted-concrete-v10`;
  material.needsUpdate=true;
  return {
    // Rebind these objects after Reflector's uniform cloning so one diagnostic
    // control changes both the real material and its mirrored-image coverage.
    coverageUniforms,
    setEnabled(enabled:boolean){strength.value=enabled?1:0;},
    setStrength(value:number){strength.value=THREE.MathUtils.clamp(value,0,1);},
    setAuthoredTexture(texture:THREE.Texture){authoredTexture.value=texture;authoredStrength.value=1;},
    setAuthoredStrength(value:number){authoredStrength.value=authoredTexture.value?THREE.MathUtils.clamp(value,0,1):0;},
    setAuthoredScale(metres:number){authoredScale.value=Math.max(.1,metres);},
    setLightPaintStrength(value:number){lightPaintStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setIllustratedStrength(value:number){illustratedStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setIllustratedLightScale(value:number){illustratedLightScale.value=THREE.MathUtils.clamp(value,.1,10);},
    setUnderpaintingStrength(value:number){underpaintingStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setInteriorStrength(value:number){interiorStrength.value=THREE.MathUtils.clamp(Number.isNaN(value)?0:value,0,1);},
    stats(){return {interiorStrength:interiorStrength.value};},
    setCoverageTexture(texture:THREE.Texture){coverageUniforms.garageConcreteStrokeMap.value=texture;coverageUniforms.garageConcreteStrokeReady.value=1;},
    setCoverageStrength(value:number){coverageUniforms.garageConcreteCoverage.value=THREE.MathUtils.clamp(value,0,1);},
  };
}
