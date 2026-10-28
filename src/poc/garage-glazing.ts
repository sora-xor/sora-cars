import * as THREE from 'three';
import { paintedHighlightDeclarations } from './painted-highlights';
import { illustratedReflectionDeclarations } from './illustrated-reflections';

/** Thin automotive glazing: preserve reflected radiance through alpha blending. */
export function createGarageGlazing() {
  const strength={value:1},painted={value:1},highlightPaint={value:1};
  const reflection={value:null as THREE.Texture|null},reflectionStrength={value:0};
  const styled=new WeakSet<THREE.Material>();
  const meshes:{mesh:THREE.Mesh,receiveShadow:boolean}[]=[];
  const updateShadowReceiving=()=>{
    for(const entry of meshes)entry.mesh.receiveShadow=strength.value>0||entry.receiveShadow;
  };
  return {
    setEnabled(enabled:boolean){strength.value=enabled?1:0;updateShadowReceiving();},
    setPainted(enabled:boolean){painted.value=enabled?1:0;},
    setHighlightPaintStrength(value:number){highlightPaint.value=THREE.MathUtils.clamp(value,0,1);},
    setReflectionMap(texture:THREE.Texture){reflection.value=texture;reflectionStrength.value=.85;},
    setReflectionStrength(value:number){reflectionStrength.value=THREE.MathUtils.clamp(value,0,1);},
    apply(root:THREE.Object3D){
      root.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||!(object.material instanceof THREE.MeshStandardMaterial)
          ||object.material.name!=='Windows')return;
        const material=object.material;
        if(!meshes.some(entry=>entry.mesh===object))meshes.push({mesh:object,receiveShadow:object.receiveShadow});
        if(styled.has(material))return;
        styled.add(material);
        const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
          previous.call(material,shader,renderer);
          shader.uniforms.soraGlazingStrength=strength;
          shader.uniforms.soraGlazingPainted=painted;
          shader.uniforms.soraGlazingHighlightPaint=highlightPaint;
          shader.uniforms.soraIllustratedReflection=reflection;
          shader.uniforms.soraIllustratedReflectionStrength=reflectionStrength;
          shader.vertexShader=`varying vec3 vGlazingPosition;\n${shader.vertexShader}`;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
            #include <begin_vertex>
            vGlazingPosition=position;
          `);
          shader.fragmentShader=/* glsl */`
            uniform float soraGlazingStrength;
            uniform float soraGlazingPainted;
            uniform float soraGlazingHighlightPaint;
            varying vec3 vGlazingPosition;
            ${paintedHighlightDeclarations}
            ${illustratedReflectionDeclarations}
            float glazingHash(vec2 p){
              vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
              q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
            }
            float glazingField(vec2 p){
              vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
              return mix(mix(glazingHash(cell),glazingHash(cell+vec2(1,0)),f.x),
                mix(glazingHash(cell+vec2(0,1)),glazingHash(cell+vec2(1,1)),f.x),f.y);
            }
            vec3 glazingReflection(vec3 radiance,float stroke){
              float energy=dot(radiance,vec3(.2126,.7152,.0722));
              float level=log2(1.+energy*12.)*3.+(stroke-.5)*.38;
              float footprint=fwidth(level),aa=clamp(footprint*.65,.045,.24);
              float groupedLevel=floor(level)+smoothstep(.42-aa,.58+aa,fract(level));
              float grouped=(exp2(max(0.,groupedLevel)/3.)-1.)/12.;
              float gain=clamp(grouped/max(energy,.0001),.75,1.4);
              float blend=soraGlazingPainted*.55*(1.-smoothstep(.45,1.3,footprint))
                *smoothstep(.001,.015,energy);
              vec3 originalPaint=radiance*mix(1.,gain,blend);
              return mix(originalPaint,boundedPaintReflection(radiance,stroke),
                soraGlazingPainted*soraGlazingHighlightPaint);
            }
          `+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',/* glsl */`
            #include <lights_fragment_end>
            // Clear glass has negligible diffuse scattering. Keep the actual
            // GGX direct/environment reflection, including its dielectric F0.
            reflectedLight.directDiffuse*=1.-soraGlazingStrength;
            reflectedLight.indirectDiffuse*=1.-soraGlazingStrength;
            vec2 glazingP=vec2(vGlazingPosition.x,vGlazingPosition.y+vGlazingPosition.z*.28)*vec2(5.,24.);
            float glazingStroke=glazingField(glazingP);
            float glazingFootprint=max(length(dFdx(glazingP)),length(dFdy(glazingP)));
            glazingStroke=mix(.5,glazingStroke,1.-smoothstep(.35,1.2,glazingFootprint));
            reflectedLight.directSpecular=mix(reflectedLight.directSpecular,
              glazingReflection(reflectedLight.directSpecular,glazingStroke),soraGlazingStrength);
            reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
              glazingReflection(reflectedLight.indirectSpecular,glazingStroke),soraGlazingStrength);
            vec3 paintedReflection=illustratedReflection(normal,normalize(vViewPosition));
            float reflectionEnergy=dot(reflectedLight.indirectSpecular,vec3(.2126,.7152,.0722));
            float facing=clamp(dot(normal,normalize(vViewPosition)),0.,1.);
            float reflectedCoverage=.06+.60*pow(1.-facing,3.);
            reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
              paintedReflection*reflectedCoverage*(.45+sqrt(reflectionEnergy)),
              soraGlazingStrength*soraGlazingPainted*soraIllustratedReflectionStrength);
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',/* glsl */`
            #include <opaque_fragment>
            float glazingFacing=clamp(dot(normal,normalize(vViewPosition)),0.,1.);
            float glazingFresnel=.04+.96*pow(1.-glazingFacing,5.);
            // A thin neutral absorbing sheet. Grazing paths cover more of the
            // interior; the existing interior still renders behind the pane.
            float glazingTransmission=(1.-glazingFresnel)*exp(-.11/max(glazingFacing,.25));
            float glazingCoverage=clamp(1.-glazingTransmission,.04,1.);
            // Straight-alpha blending would otherwise multiply the physical
            // reflected light by opacity a second time. Undo that attenuation
            // before the HDR blend; leave the destination's transmission intact.
            vec4 glazingOutput=vec4(outgoingLight/glazingCoverage,glazingCoverage);
            gl_FragColor=mix(gl_FragColor,glazingOutput,soraGlazingStrength);
          `);
        };
        material.customProgramCacheKey=()=>`${previousKey}:poc-thin-automotive-glazing-v3`;
        material.needsUpdate=true;
      });
      updateShadowReceiving();
      return meshes.map(entry=>entry.mesh);
    },
  };
}
