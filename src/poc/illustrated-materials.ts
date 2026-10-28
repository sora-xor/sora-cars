import * as THREE from 'three';
import { paintedMarkDeclarations } from './painted-marks';
import { illustratedReflectionDeclarations } from './illustrated-reflections';
import { illustratedPigmentDeclarations, pickIllustratedPigments } from './illustrated-pigments';
import { enamelVertexDeclarations, enamelVertex, enamelDeclarations, enamelAlbedo,
  enamelArtistNormal, enamelClearcoatNormal } from './illustrated-enamel';
import { pickWorkshopEdgeFamily, createWorkshopEdgePaintControl, workshopEdgeVertexDeclarations,
  workshopEdgeVertex, workshopEdgeDeclarations } from './illustrated-edge-paint';
import { pickIllustratedEngineMetal, illustratedMetalDeclarations, ILLUSTRATED_METAL_STYLE_VERSION } from './illustrated-metal';

/**
 * Material-light study, not a final-colour filter.
 * See docs/cutscene-rendering-research-2026.md: independent light/shade/specular
 * ramps (Never's End, GDC 2026) and attached painterly normals (RenderMan 27).
 */
export function createIllustratedMaterials() {
  const enabled={value:1}, marks={value:null as THREE.Texture|null};
  const normalStrength={value:.12};
  const reflection={value:null as THREE.Texture|null},reflectionStrength={value:0};
  const pigmentStrength={value:1};
  // Keep surface painting independent from how strongly lighting is stepped.
  // This lets the detailed physical light response survive beneath the paint.
  const lightingStyleStrength={value:1};
  // Enamel colour planes are painted from the accumulated illumination. Keep
  // this independent of the specular/metal response so PBR gradients do not
  // dilute the painted diffuse whenever machined detail needs softer stepping.
  const enamelLightingStrength={value:1};
  const architecturalLightingStrength={value:1};
  const surfaceLightingStrength={value:1};
  const surfacePatchStrength={value:1};
  const surfaceInteriorStrength={value:1};
  const pigmentContinuousStrength={value:1};
  const engineMetalStrength={value:1};
  const enginePigmentStrength={value:1};
  const engineNormalStrength={value:1};
  const enamelAtlas={value:null as THREE.Texture|null},enamelStrength={value:0};
  const enamelNormalStrength={value:.02};
  const enamelClearcoatNormalStrength={value:.085};
  const enamelSurfaceStrength={value:.5};
  const enamelInteriorStrength={value:.45},apronInteriorStrength={value:.35};
  // Median of opaque pixels in the unchanged authored atlas.
  const enamelAtlasBase={value:new THREE.Color('#f0e4d0')};
  const workshopEdges=createWorkshopEdgePaintControl();
  const pigmentFamilies:Record<string,number>={};
  const styled=new WeakSet<THREE.Material>();
  let materialCount=0;
  return {
    setEnabled(value:boolean){enabled.value=value?1:0;},
    setTexture(texture:THREE.Texture){marks.value=texture;},
    setReflectionMap(texture:THREE.Texture){reflection.value=texture;reflectionStrength.value=.85;},
    setReflectionStrength(value:number){reflectionStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setNormalStrength(value:number){normalStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setPigmentStrength(value:number){pigmentStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setLightingStyleStrength(value:number){lightingStyleStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEnamelLightingStrength(value:number){enamelLightingStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setArchitecturalLightingStrength(value:number){architecturalLightingStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setSurfaceLightingStrength(value:number){surfaceLightingStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setSurfacePatchStrength(value:number){surfacePatchStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setSurfaceInteriorStrength(value:number){surfaceInteriorStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setPigmentContinuousStrength(value:number){pigmentContinuousStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEngineMetalStrength(value:number){engineMetalStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEnginePigmentStrength(value:number){enginePigmentStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEngineNormalStrength(value:number){engineNormalStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEnamelAtlas(texture:THREE.Texture){enamelAtlas.value=texture;enamelStrength.value=1;},
    setEnamelStrength(value:number){enamelStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEnamelSurfaceStrength(value:number){enamelSurfaceStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setEnamelInteriorStrength(value:number){enamelInteriorStrength.value=THREE.MathUtils.clamp(Number.isNaN(value)?0:value,0,1);},
    setApronInteriorStrength(value:number){apronInteriorStrength.value=THREE.MathUtils.clamp(Number.isNaN(value)?0:value,0,1);},
    setWorkshopEdgeStrength:workshopEdges.setStrength,
    stats(){return {enabled:enabled.value===1,materials:materialCount,normalStrength:normalStrength.value,
      enamelStrength:enamelStrength.value,
      enamelSurfaceStrength:enamelSurfaceStrength.value,
      enamelInteriorStrength:enamelInteriorStrength.value,
      apronInteriorStrength:apronInteriorStrength.value,
      workshopEdges:workshopEdges.stats(),
      lightingStyleStrength:lightingStyleStrength.value,
      enamelLightingStrength:enamelLightingStrength.value,
      architecturalLightingStrength:architecturalLightingStrength.value,
      surfaceLightingStrength:surfaceLightingStrength.value,
      surfacePatchStrength:surfacePatchStrength.value,
      surfaceInteriorStrength:surfaceInteriorStrength.value,
      pigmentContinuousStrength:pigmentContinuousStrength.value,
      engineMetalStrength:engineMetalStrength.value,
      enginePigmentStrength:enginePigmentStrength.value,
      engineNormalStrength:engineNormalStrength.value,
      pigmentStrength:pigmentStrength.value,pigmentFamilies:{...pigmentFamilies}};},
    apply(root:THREE.Object3D){root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!(material instanceof THREE.MeshStandardMaterial)||styled.has(material)
          ||material.transparent||material.opacity<1||material.userData.garageLeafPaint
          ||material.userData.garagePaintedFloor
          ||(material instanceof THREE.MeshPhysicalMaterial&&material.transmission>0))continue;
        styled.add(material);materialCount++;
        const enamel=material.name==='Primary';
        const paintedEnamel=enamel&&!!object.geometry.getAttribute('enamelForm');
        const paintedApron=enamel&&material.userData.garagePaintedApron===true;
        const metal=material.metalness>.45;
        const pigments=pickIllustratedPigments(material);
        const engineMetal=pickIllustratedEngineMetal(material);
        const workshopFamily=pickWorkshopEdgeFamily(material);
        if(pigments)pigmentFamilies[pigments.family]=(pigmentFamilies[pigments.family]??0)+1;
        const previous=material.onBeforeCompile, previousKey=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
          previous.call(material,shader,renderer);
          Object.assign(shader.uniforms,{soraIllustrated:enabled,soraPaintMarks:marks,
            soraIllustratedLightingStrength:lightingStyleStrength,
            soraEnamelLightingStrength:enamelLightingStrength,
            soraEnamelInteriorStrength:enamelInteriorStrength,
            soraApronInteriorStrength:apronInteriorStrength,
            soraArchitecturalLightingStrength:architecturalLightingStrength,
            soraSurfaceLightingStrength:surfaceLightingStrength,
            soraSurfacePatchStrength:surfacePatchStrength,
            soraSurfaceInteriorStrength:surfaceInteriorStrength,
            soraPigmentContinuousStrength:pigmentContinuousStrength,
            soraEngineMetalStrength:engineMetalStrength,
            soraEnginePigmentStrength:enginePigmentStrength,
            soraEngineNormalStrength:engineNormalStrength,
            soraPaintMarksStrength:{value:1},soraBrushNormalStrength:normalStrength,
            soraIllustratedReflection:reflection,soraIllustratedReflectionStrength:reflectionStrength,
            soraShadeAmount:{value:enamel?.24:metal?.075:.105},
            soraMetal:{value:metal?1:0},soraEnamel:{value:enamel?1:0}});
          if(pigments)Object.assign(shader.uniforms,pigments.uniforms,{soraPigmentStrength:pigmentStrength});
          if(engineMetal)Object.assign(shader.uniforms,engineMetal.uniforms);
          if(paintedEnamel)Object.assign(shader.uniforms,{soraEnamelAtlas:enamelAtlas,
            soraEnamelAtlasBase:enamelAtlasBase,soraEnamelStrength:enamelStrength,
            soraEnamelNormalStrength:enamelNormalStrength,
            soraEnamelSurfaceStrength:enamelSurfaceStrength,
            soraEnamelClearcoatNormalStrength:enamelClearcoatNormalStrength});
          if(workshopFamily)Object.assign(shader.uniforms,workshopEdges.uniforms(workshopFamily));
          shader.vertexShader=`varying vec3 vIllustratedPosition;varying vec3 vPigmentNormal;
            varying vec3 vIllustratedTangent;varying vec3 vIllustratedBitangent;
            ${paintedEnamel?enamelVertexDeclarations:''}
            ${workshopFamily?workshopEdgeVertexDeclarations:''}\n${shader.vertexShader}`;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
            ${paintedEnamel?enamelVertex:''}
            ${workshopFamily?workshopEdgeVertex:''}
            vec3 illustrationScale=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
            #ifdef USE_INSTANCING
              illustrationScale*=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
            #endif
            vIllustratedPosition=position*illustrationScale;
            vPigmentNormal=normal;
            vec3 brushN=normalize(normal);
            vec3 brushAxis=abs(brushN.y)<.92?vec3(0.,1.,0.):vec3(0.,0.,1.);
            vec3 brushT=normalize(cross(brushAxis,brushN));
            vec3 brushB=cross(brushN,brushT);
            #ifdef USE_INSTANCING
              brushT=mat3(instanceMatrix)*brushT;brushB=mat3(instanceMatrix)*brushB;
            #endif
            vIllustratedTangent=normalize((modelViewMatrix*vec4(brushT,0.)).xyz);
            vIllustratedBitangent=normalize((modelViewMatrix*vec4(brushB,0.)).xyz);
            #ifdef FLIP_SIDED
              vIllustratedTangent=-vIllustratedTangent;vIllustratedBitangent=-vIllustratedBitangent;
            #endif
          `);
          shader.fragmentShader=`
            uniform float soraIllustrated,soraBrushNormalStrength,soraShadeAmount,soraMetal,soraEnamel;
            uniform float soraIllustratedLightingStrength,soraEnamelLightingStrength,soraEngineMetalStrength,soraEnginePigmentStrength;
            uniform float soraArchitecturalLightingStrength;
            uniform float soraSurfaceLightingStrength,soraSurfacePatchStrength;
            uniform float soraEnamelInteriorStrength,soraApronInteriorStrength;
            uniform float soraEngineNormalStrength;
            #define soraLightStyle (soraIllustrated*soraIllustratedLightingStrength)
            varying vec3 vIllustratedPosition;
            varying vec3 vIllustratedTangent,vIllustratedBitangent;
            ${paintedMarkDeclarations}
            ${illustratedReflectionDeclarations}
            ${paintedEnamel?enamelDeclarations:''}
            ${engineMetal?illustratedMetalDeclarations:''}
            ${workshopFamily?workshopEdgeDeclarations:''}
            ${pigments?illustratedPigmentDeclarations+'\nuniform float soraPigmentStrength;':''}
            vec3 illustrationPhysicalDirect=vec3(0.);
            vec3 illustrationPhysicalSpecular=vec3(0.);
            float illustrationMark;
            float illustrationLum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
            float illustrationStep(float x,float edge){
              float aa=clamp(fwidth(x)*.6,.018,.065);
              return smoothstep(edge-aa,edge+aa,x);
            }
            // Authored response, six unequal pigment intervals. Shadow colour
            // is a separate layer and is not added once for every light.
            vec3 illustrationDirect(vec3 source,vec3 albedo){
              float energy=illustrationLum(source)/max(illustrationLum(albedo),.0001);
              float level=log2(1.+energy*3.)+(illustrationMark-.5)*.06;
              float ramp=.06*illustrationStep(level,.08)+.11*illustrationStep(level,.24)
                +.19*illustrationStep(level,.52)+.36*illustrationStep(level,.96)
                +.58*illustrationStep(level,1.65)+1.*illustrationStep(level,2.6);
              // Retain source light hue, attenuation, shadowing and normal.
              return source*(ramp/max(energy,.0001));
            }
            vec3 illustrationSpecular(vec3 source){
              float energy=illustrationLum(source);
              float level=log2(1.+energy*12.)+(${paintedEnamel?'enamelLightingMark':'illustrationMark'}-.5)*.27;
              float ramp=.018*illustrationStep(level,.18)+.045*illustrationStep(level,.65)
                +.09*illustrationStep(level,1.2)+.18*illustrationStep(level,2.0)
                +.30*illustrationStep(level,3.0);
              // Weak detail remains continuous; major reflections become
              // painted shapes. The highlight is always sourced from light.
              ramp=mix(energy,ramp,smoothstep(.006,.035,energy)*.88);
              return source*(ramp/max(energy,.0001));
            }
            ${paintedEnamel?`
              vec3 enamelLightAccent(vec3 source){
                // Accent coverage changes the physical reflection's shape,
                // never its location or hue. No light produces no paint glow.
                float energy=illustrationLum(source);
                float resolvedLight=smoothstep(.008,.06,energy);
                float coverage=mix(.45,1.15,enamelClearcoatStrokeMask);
                vec3 accent=illustrationSpecular(source)*mix(1.,coverage,resolvedLight);
                return mix(source,accent,enamelBlend*.8);
              }
            `:''}
          `+shader.fragmentShader;
          if(paintedEnamel)shader.fragmentShader=shader.fragmentShader.replace(
            '#include <color_fragment>',`#include <color_fragment>\n${enamelAlbedo}`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
            illustrationMark=authoredPaintMarks(vIllustratedPosition,vPigmentNormal);
            float markAcross=authoredPaintMarks(vIllustratedPosition+vec3(.77,1.13,.39),vPigmentNormal);
            vec3 brushTangent=normalize(vIllustratedTangent-normal*dot(normal,vIllustratedTangent));
            vec3 brushBitangent=normalize(vIllustratedBitangent-normal*dot(normal,vIllustratedBitangent));
            vec3 brushDirection=brushTangent*(illustrationMark-.5)+brushBitangent*(markAcross-.5);
            #ifdef DOUBLE_SIDED
              brushDirection*=faceDirection;
            #endif
            // Cluster normals, not a height-noise bump. Positions are mesh
            // rest coordinates, so marks don't swim as the camera or car moves.
            float brushFootprint=max(length(dFdx(vIllustratedPosition)),length(dFdy(vIllustratedPosition)));
            float brushResolve=1.-smoothstep(.04,.15,brushFootprint);
            vec3 brushPerturbation=brushDirection*soraBrushNormalStrength*soraIllustrated*brushResolve
              ${paintedEnamel?'*0.':engineMetal?'*(1.-soraEngineMetalStrength*soraEnginePigmentStrength*soraEngineNormalStrength)':pigments?'*(1.-soraPigmentStrength*.85)':''};
            normal=normalize(normal+brushPerturbation);
            ${paintedEnamel?enamelArtistNormal:''}
            ${engineMetal?`
              float enginePlaneA=authoredPaintPatches(vIllustratedPosition*.5,vPigmentNormal);
              float enginePlaneB=authoredPaintPatches(vIllustratedPosition*.5+vec3(1.73,.81,2.39),vPigmentNormal);
              vec3 engineTangent=vIllustratedTangent,engineBitangent=vIllustratedBitangent;
              #ifdef DOUBLE_SIDED
                engineTangent*=faceDirection;engineBitangent*=faceDirection;
              #endif
              normal=illustratedMetalNormal(normal,engineTangent,engineBitangent,enginePlaneA,enginePlaneB,
                soraIllustrated*soraEngineMetalStrength*soraEnginePigmentStrength*soraEngineNormalStrength
                *${engineMetal.family==='machined-aluminium'||engineMetal.family==='brass'?'.45':engineMetal.family==='oxidised-iron'?'.65':'1.'});
            `:''}
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>',`#include <clearcoat_normal_fragment_maps>
            #ifdef USE_CLEARCOAT
              ${paintedEnamel?enamelClearcoatNormal:'clearcoatNormal=normalize(clearcoatNormal+brushPerturbation);'}
            #endif
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',`#include <lights_physical_pars_fragment>
            void RE_Direct_Illustrated(const in IncidentLight light,const in vec3 p,const in vec3 n,
              const in vec3 viewDir,const in vec3 coatNormal,const in PhysicalMaterial m,inout ReflectedLight r){
              vec3 beforeDiffuse=r.directDiffuse,beforeSpecular=r.directSpecular;
              vec3 beforeCoat=clearcoatSpecularDirect;
              RE_Direct_Physical(light,p,n,viewDir,coatNormal,m,r);
              vec3 source=r.directDiffuse-beforeDiffuse;
              illustrationPhysicalDirect+=source;
              r.directDiffuse=beforeDiffuse+mix(source,illustrationDirect(source,m.diffuseColor),soraLightStyle);
              vec3 specular=r.directSpecular-beforeSpecular;
              illustrationPhysicalSpecular+=specular;
              r.directSpecular=beforeSpecular+mix(specular,illustrationSpecular(specular),soraLightStyle);
              vec3 coat=clearcoatSpecularDirect-beforeCoat;
              clearcoatSpecularDirect=beforeCoat+${paintedEnamel?'enamelLightAccent(coat)':'mix(coat,illustrationSpecular(coat),soraLightStyle)'};
            }
            #undef RE_Direct
            #define RE_Direct RE_Direct_Illustrated
            #if NUM_RECT_AREA_LIGHTS > 0
            void RE_Rect_Illustrated(const in RectAreaLight light,const in vec3 p,const in vec3 n,
              const in vec3 viewDir,const in vec3 coatNormal,const in PhysicalMaterial m,inout ReflectedLight r){
              vec3 beforeDiffuse=r.directDiffuse,beforeSpecular=r.directSpecular;
              vec3 beforeCoat=clearcoatSpecularDirect;
              RE_Direct_RectArea_Physical(light,p,n,viewDir,coatNormal,m,r);
              vec3 source=r.directDiffuse-beforeDiffuse;
              illustrationPhysicalDirect+=source;
              r.directDiffuse=beforeDiffuse+mix(source,illustrationDirect(source,m.diffuseColor),soraLightStyle);
              vec3 specular=r.directSpecular-beforeSpecular;
              illustrationPhysicalSpecular+=specular;
              r.directSpecular=beforeSpecular+mix(specular,illustrationSpecular(specular),soraLightStyle);
              vec3 coat=clearcoatSpecularDirect-beforeCoat;
              clearcoatSpecularDirect=beforeCoat+${paintedEnamel?'enamelLightAccent(coat)':'mix(coat,illustrationSpecular(coat),soraLightStyle)'};
            }
            #undef RE_Direct_RectArea
            #define RE_Direct_RectArea RE_Rect_Illustrated
            #endif
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
            // A separately authored cool shadow albedo preserves enamel and
            // coloured steel instead of multiplying them down towards black.
            vec3 shadeTint=mix(vec3(.66,.72,1.02),vec3(.88,.79,.82),soraEnamel);
            vec3 shadeAlbedo=diffuseColor.rgb*shadeTint;
            vec3 sourceIndirect=reflectedLight.indirectDiffuse;
            ${engineMetal?'vec3 enginePhysicalIndirectSpecular=reflectedLight.indirectSpecular;':''}
            float shadeVisibility=smoothstep(0.,.04,illustrationLum(sourceIndirect)
              /max(illustrationLum(material.diffuseColor),.0001));
            vec3 shadowPaint=shadeAlbedo*soraShadeAmount*(.94+illustrationMark*.12)*shadeVisibility;
            vec3 indirectShape=illustrationDirect(sourceIndirect,material.diffuseColor)*.32;
            reflectedLight.indirectDiffuse=mix(sourceIndirect,shadowPaint+indirectShape,soraLightStyle);
            ${pigments?`
              vec3 surfacePaintPosition=vIllustratedPosition*${pigments.family==='cabinet-enamel'?'1.':pigments.family==='charcoal-trim'?'.7':'.35'};
              ${workshopFamily?`
                // The prepared seed is frozen in mesh data. Repeated drawers
                // get distinct paint loads that remain attached when moved.
                surfacePaintPosition+=vWorkshopEdgeSeedUp.x*vec3(.173,.391,.271);
              `:''}
              float surfacePatchMark=mix(.5,authoredPaintPatches(surfacePaintPosition,vPigmentNormal),soraSurfacePatchStrength);
              float pigmentMark=${paintedEnamel?'mix(illustrationMark,enamelLightingMark,soraEnamelStrength)':'surfacePatchMark'};
              // UV paint's dark loads place the cool interior pigment. Its
              // original polarity still controls light-boundary placement.
              // The apron has different UVs, so use its attached rest-space
              // marks at a finer scale without projecting the body atlas.
              float interiorMark=${paintedEnamel?'1.-pigmentMark':paintedApron?'authoredPaintPatches(vIllustratedPosition*.7,vPigmentNormal)':'pigmentMark'};
              float interiorAmount=${paintedEnamel?'soraEnamelInteriorStrength*soraEnamelStrength*mix(.45,1.,clamp(enamelRidge+enamelCavity,0.,1.))':paintedApron?'soraApronInteriorStrength':'soraPigmentInteriorStrength'}*soraSurfaceInteriorStrength;
              vec3 pigmentDiffuse=illustratedPigmentDiffuse(illustrationPhysicalDirect,sourceIndirect,
                material.diffuseColor,pigmentMark,interiorMark,interiorAmount);
              float physicalDirectEnergy=illustrationLum(illustrationPhysicalDirect);
              float physicalIndirectEnergy=illustrationLum(sourceIndirect);
              float pigmentDirectShare=physicalDirectEnergy/max(physicalDirectEnergy+physicalIndirectEnergy,.0001);
              float pigmentBlend=${enamel?'soraIllustrated*mix(soraIllustratedLightingStrength,1.,soraEnamelLightingStrength)':pigments.family==='architectural-steel'?'soraIllustrated*mix(soraIllustratedLightingStrength,1.,soraArchitecturalLightingStrength)':'soraIllustrated*mix(soraIllustratedLightingStrength,1.,soraSurfaceLightingStrength)'}*soraPigmentStrength;
              reflectedLight.directDiffuse=mix(reflectedLight.directDiffuse,pigmentDiffuse*pigmentDirectShare,pigmentBlend);
              reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,pigmentDiffuse*(1.-pigmentDirectShare),pigmentBlend);
            `:''}
            ${workshopFamily?`
              if(soraIllustrated>0.&&soraWorkshopEdgeStrength>0.){
                vec3 workshopStyled=reflectedLight.directDiffuse+reflectedLight.indirectDiffuse;
                vec3 workshopDirectShare=reflectedLight.directDiffuse/max(workshopStyled,vec3(.0001));
                vec3 workshopPainted=workshopEdgePaintDiffuse(workshopStyled,
                  illustrationPhysicalDirect+sourceIndirect,material.diffuseColor,soraIllustrated);
                reflectedLight.directDiffuse=workshopPainted*workshopDirectShare;
                reflectedLight.indirectDiffuse=workshopPainted*(1.-workshopDirectShare);
              }
            `:''}
            reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
              illustrationSpecular(reflectedLight.indirectSpecular)*(1.+soraMetal*.35),soraLightStyle);
            // Artist-authored normal-to-reflection response, a material tool
            // used in Never's End. It is explicitly view dependent; geometric
            // occlusion and local irradiance still govern the surface.
            vec3 reflectionPaint=illustratedReflection(normal,vViewPosition);
            float reflectionEnergy=illustrationLum(reflectedLight.indirectSpecular);
            reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
              reflectionPaint*(.18+sqrt(reflectionEnergy)*.65)*diffuseColor.rgb
                *smoothstep(0.,.004,reflectionEnergy),
              soraLightStyle*soraIllustratedReflectionStrength*soraMetal);
            #ifdef USE_CLEARCOAT
              ${paintedEnamel?`
                clearcoatSpecularIndirect=enamelLightAccent(clearcoatSpecularIndirect);
              `:`
              clearcoatSpecularIndirect=mix(clearcoatSpecularIndirect,illustrationSpecular(clearcoatSpecularIndirect),soraLightStyle);
              vec3 coatPaint=illustratedReflection(clearcoatNormal,vViewPosition);
              float coatEnergy=illustrationLum(clearcoatSpecularIndirect);
              clearcoatSpecularIndirect=mix(clearcoatSpecularIndirect,
                coatPaint*(.025+sqrt(coatEnergy)*.28)*smoothstep(0.,.002,coatEnergy),
                soraLightStyle*soraIllustratedReflectionStrength*soraEnamel);
              `}
            #endif
            ${engineMetal?`
              // Metal is painted from its real direct light and local probe.
              // The generic albedo shadow floor would add diffuse back onto
              // surfaces whose physical metalness deliberately removed it.
              float enginePaintBlend=soraIllustrated*soraEngineMetalStrength;
              reflectedLight.directDiffuse=mix(reflectedLight.directDiffuse,
                illustrationPhysicalDirect,enginePaintBlend);
              reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,
                sourceIndirect,enginePaintBlend);
              vec3 engineReflection=illustrationPhysicalSpecular+enginePhysicalIndirectSpecular;
              float engineDirectShare=illustrationLum(illustrationPhysicalSpecular)
                /max(illustrationLum(engineReflection),.000001);
              float enginePatch=enginePlaneA;
              vec3 enginePigment=illustratedMetalPigment(engineReflection,enginePatch,
                ${engineMetal.strength.toFixed(3)},${engineMetal.accent.toFixed(3)});
              reflectedLight.directSpecular=mix(reflectedLight.directSpecular,
                mix(illustrationPhysicalSpecular,enginePigment*engineDirectShare,soraEnginePigmentStrength),enginePaintBlend);
              reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
                mix(enginePhysicalIndirectSpecular,enginePigment*(1.-engineDirectShare),soraEnginePigmentStrength),enginePaintBlend);
            `:''}
          `);
        };
        material.customProgramCacheKey=()=>`${previousKey}:illustrated-light-v15:${enamel}:${paintedEnamel}:${paintedApron}:${metal}:${pigments?.family??'physical'}:${workshopFamily??'none'}:${engineMetal?`${ILLUSTRATED_METAL_STYLE_VERSION}:${engineMetal.family}:${engineMetal.strength}:${engineMetal.accent}`:'generic'}`;
        material.needsUpdate=true;
      }
    });},
  };
}
