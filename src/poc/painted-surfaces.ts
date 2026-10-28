import * as THREE from 'three';
import { bodyworkColor, bodyworkDeclarations, bodyworkLighting } from './painted-bodywork';
import { paintedEdgeDeclarations, paintedEdgeLighting } from './painted-edges';
import { engineColor, engineDeclarations, engineLighting, engineNormal, engineRoughness } from './painted-engine';
import { paintedMarkDeclarations } from './painted-marks';

/** Paint is attached to each mesh, before projection, reflection and pixelation. */
export function createPaintedSurfaces() {
  const strength = { value: 1 };
  const bodyworkStrength = { value: 1 };
  const highlightPaintStrength = { value: 1 };
  const edgePaintStrength = { value: 1 };
  const enginePaintStrength = { value: 1 };
  const illustrationStrength = { value: 1 };
  const marks={value:null as THREE.Texture|null},marksStrength={value:0};
  const styled = new WeakSet<THREE.Material>();
  return {
    setEnabled(enabled: boolean) { strength.value = enabled ? 1 : 0; },
    setBodyworkStrength(value: number) { bodyworkStrength.value = THREE.MathUtils.clamp(value,0,1); },
    setHighlightPaintStrength(value: number) { highlightPaintStrength.value = THREE.MathUtils.clamp(value,0,1); },
    setEdgeStrength(value: number) { edgePaintStrength.value = THREE.MathUtils.clamp(value,0,1); },
    setEngineStrength(value: number) { enginePaintStrength.value = THREE.MathUtils.clamp(value,0,1); },
    setIllustrationStrength(value:number){illustrationStrength.value=THREE.MathUtils.clamp(value,0,1);},
    setPaintMarks(texture:THREE.Texture){marks.value=texture;marksStrength.value=1;},
    setPaintMarksStrength(value:number){marksStrength.value=THREE.MathUtils.clamp(value,0,1);},
    apply(root: THREE.Object3D) {
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial) || styled.has(material)
            || material.userData.garagePaintedFloor || material.userData.garageLeafPaint
            || material.transparent || material.opacity < 1
            || (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0)) continue;
          styled.add(material);
          const previous = material.onBeforeCompile;
          const previousKey = material.customProgramCacheKey();
          const bodywork = material.name === 'Primary';
          const engine = material.name.startsWith('Engine / ') && material.metalness > .45;
          material.onBeforeCompile = (shader, renderer) => {
            previous.call(material, shader, renderer);
            shader.uniforms.soraPaintStrength = strength;
            shader.uniforms.soraIllustrationStrength = illustrationStrength;
            shader.uniforms.soraPaintMarks=marks;
            shader.uniforms.soraPaintMarksStrength=marksStrength;
            if(!bodywork) shader.uniforms.soraEdgePaintStrength = edgePaintStrength;
            if(bodywork) {
              shader.uniforms.soraBodyworkStrength = bodyworkStrength;
              shader.uniforms.soraHighlightPaintStrength = highlightPaintStrength;
            }
            if(engine) shader.uniforms.soraEnginePaintStrength = enginePaintStrength;
            shader.vertexShader = `varying vec3 vPigmentPosition;\nvarying vec3 vPigmentNormal;\n${shader.vertexShader}`;
            if(bodywork) shader.vertexShader = `varying vec3 vBodyworkNormal;\n${shader.vertexShader}`;
            if(engine) shader.vertexShader = `varying vec3 vEnginePaintNormal;\n${shader.vertexShader}`;
            // Rest-position coordinates stay attached when cars or the camera move.
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
              #include <begin_vertex>
              vec3 pigmentScale = vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
              #ifdef USE_INSTANCING
                pigmentScale *= vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
              #endif
              vPigmentPosition = position * pigmentScale;
              vPigmentNormal=normal;
              ${bodywork ? 'vBodyworkNormal = normal;' : ''}
              ${engine ? 'vEnginePaintNormal = normal;' : ''}
            `);
            shader.fragmentShader = /* glsl */ `
              varying vec3 vPigmentPosition;
              uniform float soraPaintStrength;
              uniform float soraIllustrationStrength;
              ${paintedMarkDeclarations}
              float pigmentHash(vec3 p) {
                p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
                return fract((p.x + p.y) * p.z);
              }
              float pigmentNoise(vec3 p) {
                vec3 a = floor(p), f = fract(p); f = f*f*(3.-2.*f);
                return mix(mix(mix(pigmentHash(a), pigmentHash(a+vec3(1,0,0)), f.x),
                  mix(pigmentHash(a+vec3(0,1,0)), pigmentHash(a+vec3(1,1,0)), f.x), f.y),
                  mix(mix(pigmentHash(a+vec3(0,0,1)), pigmentHash(a+vec3(1,0,1)), f.x),
                  mix(pigmentHash(a+vec3(0,1,1)), pigmentHash(a+vec3(1,1,1)), f.x), f.y), f.z);
              }
              ${bodywork ? bodyworkDeclarations : ''}
              ${!bodywork ? paintedEdgeDeclarations : ''}
              ${engine ? engineDeclarations : ''}
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
              #include <color_fragment>
              ${bodywork ? 'vec4 bodyworkSourceColor = diffuseColor;' : ''}
              ${engine ? 'vec4 engineSourceColor = diffuseColor;' : ''}
              // Three sizes of broken pigment; coarse marks describe planes and
              // fine ones weather them. This is not frame-wide grain.
              vec3 pigmentP = vPigmentPosition * vec3(1., 1.65, .8);
              vec3 pigmentFootprint = max(abs(dFdx(pigmentP)),abs(dFdy(pigmentP)));
              float pigmentPixel = max(pigmentFootprint.x,max(pigmentFootprint.y,pigmentFootprint.z));
              // Fade unresolved octaves toward their mean so camera motion
              // does not turn attached paint marks into subpixel sparkle.
              float pigmentBroad = mix(.5,pigmentNoise(pigmentP*8.),1.-smoothstep(.24,.8,pigmentPixel*8.));
              float pigmentFine = mix(.5,pigmentNoise(pigmentP*49.),1.-smoothstep(.24,.8,pigmentPixel*49.));
              float pigmentDry = mix(.5,pigmentNoise(pigmentP*157.),1.-smoothstep(.24,.8,pigmentPixel*157.));
              float authoredMark=authoredPaintMarks(vPigmentPosition,vPigmentNormal);
              float pigmentField = mix(pigmentBroad*.62 + pigmentFine*.28 + pigmentDry*.10,
                authoredMark,soraPaintMarksStrength);
              float pigmentTooth = smoothstep(.40,.59,pigmentField);
              float pigmentMatte = mix(.15, .32, smoothstep(.28,.9,roughness)) * (1.-metalness*.65);
              diffuseColor.rgb *= 1. + soraPaintStrength * pigmentMatte * (pigmentTooth-.5);
              // Small warm/cool underpainting within the same material gives
              // broad lit panels visible brush structure before final pixels.
              vec3 pigmentGlaze = mix(vec3(.88,.94,1.08),vec3(1.08,1.,.88),pigmentTooth);
              diffuseColor.rgb *= mix(vec3(1.),pigmentGlaze,soraPaintStrength*pigmentMatte*.85);
              ${bodywork ? bodyworkColor : ''}
              ${engine ? engineColor : ''}
            `);
            if(engine){
              shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\n${engineRoughness}`);
              shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${engineNormal}`);
            }
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', /* glsl */ `
              #include <lights_fragment_end>
              ${bodywork ? `vec3 bodyworkDirectDiffuse = reflectedLight.directDiffuse;
              vec3 bodyworkIndirectDiffuse = reflectedLight.indirectDiffuse;
              vec3 bodyworkDirectSpecular = reflectedLight.directSpecular;
              vec3 bodyworkIndirectSpecular = reflectedLight.indirectSpecular;` : ''}
              ${engine ? `vec3 engineDirectDiffuse = reflectedLight.directDiffuse;
              vec3 engineIndirectDiffuse = reflectedLight.indirectDiffuse;
              vec3 engineDirectSpecular = reflectedLight.directSpecular;
              vec3 engineIndirectSpecular = reflectedLight.indirectSpecular;` : ''}
              vec3 pigmentDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
              float pigmentAlbedo = max(dot(material.diffuseColor, vec3(.2126,.7152,.0722)), .028);
              float pigmentLight = dot(pigmentDiffuse, vec3(.2126,.7152,.0722)) / pigmentAlbedo;
              // Many irregular steps, not three flat cel-shading bands. Real
              // light positions, normals, occlusion and shadows still set form.
              float pigmentLevel = log2(1. + pigmentLight*2.)*5.;
              float pigmentBrokenLevel = pigmentLevel + (pigmentField-.5)*.8;
              float pigmentBand = floor(pigmentBrokenLevel) + smoothstep(.38,.66,fract(pigmentBrokenLevel));
              float pigmentGrouped = (exp2(max(0.,pigmentBand)/5.)-1.)*.5;
              float pigmentRatio = mix(1., pigmentGrouped/max(pigmentLight,.001), soraPaintStrength*.82);
              // Deliberate broad light planes retain the source albedo detail.
              // The brush field perturbs band boundaries, not the whole color.
              float planeStroke=mix(.5,pigmentNoise(pigmentP*vec3(2.8,5.6,2.8)),
                1.-smoothstep(.3,1.1,pigmentPixel*5.6));
              planeStroke=mix(planeStroke,authoredMark,soraPaintMarksStrength);
              float planeLevel=log2(1.+pigmentLight*2.)*2.2+(planeStroke-.5)*.40;
              float planeFootprint=fwidth(planeLevel),planeAA=clamp(planeFootprint*.65,.025,.20);
              float planeBand=floor(planeLevel)+smoothstep(.46-planeAA,.54+planeAA,fract(planeLevel));
              float planeValue=(exp2(max(0.,planeBand)/2.2)-1.)*.5;
              float planeResolve=1.-smoothstep(.45,1.2,planeFootprint);
              float planeLit=smoothstep(.004,.045,pigmentLight);
              float planeGain=clamp(planeValue/max(pigmentLight,.001),.62,1.5);
              float planeRatio=mix(1.,planeGain,soraPaintStrength*.94*planeResolve*planeLit);
              pigmentRatio=mix(pigmentRatio,planeRatio,soraIllustrationStrength);
              reflectedLight.directDiffuse *= pigmentRatio;
              reflectedLight.indirectDiffuse *= pigmentRatio;
              vec3 planeTint=mix(vec3(.79,.88,1.18),vec3(1.04,1.,.95),smoothstep(.10,.95,pigmentLight));
              reflectedLight.directDiffuse*=mix(vec3(1.),planeTint,soraPaintStrength*soraIllustrationStrength*.55);
              reflectedLight.indirectDiffuse*=mix(vec3(1.),planeTint,soraPaintStrength*soraIllustrationStrength*.55);
              // Opaque surface shadows contain blue/umber pigment. Glass and
              // bright emitters retain their light transport and transparency.
              float pigmentShadow = 1.-smoothstep(.10,.72,pigmentLight);
              reflectedLight.indirectDiffuse += soraPaintStrength * pigmentShadow
                * material.diffuseColor * vec3(.011,.015,.031);
              float pigmentSpecLight = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(.2126,.7152,.0722));
              // Cast metal needs broken reflected-light shapes as well as
              // diffuse paint. Keep the physical highlight direction, but
              // interrupt its smooth ramp with the same attached brush field.
              float pigmentSpecMark = mix(.48,1.18,pigmentTooth);
              vec3 pigmentSpecTint = mix(vec3(.81,.89,1.12),vec3(1.07,1.,.82),pigmentTooth);
              float pigmentSpecMix = soraPaintStrength * smoothstep(.18,.7,roughness)
                * smoothstep(.025,.22,pigmentSpecLight);
              reflectedLight.directSpecular *= mix(vec3(1.),pigmentSpecTint*pigmentSpecMark,pigmentSpecMix);
              reflectedLight.indirectSpecular *= mix(vec3(1.),pigmentSpecTint*pigmentSpecMark,pigmentSpecMix);
              ${bodywork ? bodyworkLighting : ''}
              ${engine ? engineLighting : ''}
              ${!bodywork ? paintedEdgeLighting : ''}
            `);
          };
          material.customProgramCacheKey = () => `${previousKey}:garage-painted-pigment-v8:${bodywork}:${engine}`;
          material.needsUpdate = true;
        }
      });
    },
  };
}
