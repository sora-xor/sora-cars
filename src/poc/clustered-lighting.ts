import * as THREE from 'three';

/** Analytic light-value planes before tone mapping and pixel-region grouping.
 * Uses the actual light/shadow/IBL response; no painted maps or material names.
 * Three r186 keeps diffuseContribution separate from the specular base color. */
export function createClusteredLighting() {
  const strength = { value: 0 }, diffuseBands = { value: 2 };
  const specularStrength = { value: .6 }, specularBands = { value: 3 };
  const shadeTint = { value: 0 };
  const roughnessFloor = { value: 0 }, clearcoatRoughnessFloor = { value: 0 };
  let disposed = false;
  let programGeneration = 0;
  const entries = new Map<THREE.MeshStandardMaterial, {
    compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'];
    installed: THREE.Material['onBeforeCompile']; installedKey: THREE.Material['customProgramCacheKey'];
    priorKey: string; attached: boolean;
  }>();
  const declarations = /* glsl */`
    uniform float soraClusterLightStrength, soraClusterDiffuseBands;
    uniform float soraClusterSpecularStrength, soraClusterSpecularBands;
    uniform float soraClusterShadeTint;
    uniform float soraClusterRoughnessFloor, soraClusterClearcoatRoughnessFloor;
    vec3 soraClusterDiffuseAlbedo;
    float soraLightLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
    vec3 soraLightPlanes(vec3 radiance,float bands){
      float energy=soraLightLuma(radiance);
      float level=log2(1.+energy*8.)*bands;
      // A narrow derivative-aware transition limits crawling at light edges.
      float width=clamp(fwidth(level)*.65,.035,.20);
      if(energy<=.000001)return radiance;
      float stepped=floor(level)+smoothstep(.5-width,.5+width,fract(level));
      float shaped=(exp2(stepped/bands)-1.)*.125;
      float detail=smoothstep(.003,.018,energy);
      return radiance*mix(1.,shaped/energy,detail);
    }
  `;
  return {
    configure(options:{strength?:number;diffuseBands?:number;specularStrength?:number;specularBands?:number;shadeTint?:number;
      roughnessFloor?:number;clearcoatRoughnessFloor?:number}) {
      if(disposed)return;
      const wasEnabled=strength.value>0;
      for(const [key,uniform,low,high] of [
        ['strength',strength,0,1],['diffuseBands',diffuseBands,1,8],
        ['specularStrength',specularStrength,0,1],['specularBands',specularBands,1,8],
        ['shadeTint',shadeTint,0,1],
        ['roughnessFloor',roughnessFloor,0,1],['clearcoatRoughnessFloor',clearcoatRoughnessFloor,0,1],
      ] as const){const value=options[key];if(value!==undefined&&Number.isFinite(value))uniform.value=THREE.MathUtils.clamp(value,low,high);}
      // Three can reuse an enabled program after a disabled/native program has
      // replaced its material uniform table. Give each re-enable a fresh key
      // so onBeforeCompile reconnects these uniform objects to the GPU.
      if(!wasEnabled&&strength.value>0)programGeneration++;
      // A disabled experiment uses the actual original compiled shader. Even
      // an inactive branch can alter GPU compiler arithmetic in the program.
      for(const [material,entry] of entries){
        // If our hook was detached, a newly added native owner could not have
        // captured it. Make that owner the new base before enabling again.
        // An attached inner hook must never rebase around its outer wrapper:
        // that would form a callback cycle.
        if(!entry.attached&&(material.onBeforeCompile!==entry.compile||material.customProgramCacheKey!==entry.key)){
          entry.compile=material.onBeforeCompile;entry.key=material.customProgramCacheKey;
          entry.priorKey=entry.key.call(material);
        }
        const compile=strength.value>0?entry.installed:entry.compile;
        const key=strength.value>0?entry.installedKey:entry.key;
        let changed=false;
        // A native decorator may be installed after us on a material's first
        // visible frame. Keep that owner; our retained inner hook becomes a
        // transparent delegate when disabled, including its program key.
        if((material.onBeforeCompile===entry.installed||material.onBeforeCompile===entry.compile)
          &&material.onBeforeCompile!==compile){material.onBeforeCompile=compile;changed=true;}
        if((material.customProgramCacheKey===entry.installedKey||material.customProgramCacheKey===entry.key)
          &&material.customProgramCacheKey!==key){material.customProgramCacheKey=key;changed=true;}
        if(material.onBeforeCompile===entry.installed)entry.attached=true;
        else if(material.onBeforeCompile===entry.compile)entry.attached=false;
        if(changed||wasEnabled!==(strength.value>0)){
          material.needsUpdate=true;
        }
      }
    },
    stats(){return {strength:strength.value,diffuseBands:diffuseBands.value,
      specularStrength:specularStrength.value,specularBands:specularBands.value,shadeTint:shadeTint.value,
      roughnessFloor:roughnessFloor.value,clearcoatRoughnessFloor:clearcoatRoughnessFloor.value,materials:entries.size};},
    apply(root:THREE.Object3D){if(disposed)return;root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!(material instanceof THREE.MeshStandardMaterial)||entries.has(material)
          ||material.transparent||material.opacity<1
          ||(material instanceof THREE.MeshPhysicalMaterial&&material.transmission>0))continue;
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
        // Evaluate the previous key with its original callback still installed.
        const priorKey=key.call(material);
        const entry={compile,key,priorKey,attached:false,installed:compile,installedKey:key};
        const installed:THREE.Material['onBeforeCompile']=(shader,renderer)=>{
          entry.compile.call(material,shader,renderer);
          if(disposed||strength.value<=0)return;
          // Three copies onBeforeCompile when cloning a material. Architecture
          // visibility then wraps that copied callback, so the inner clone can
          // already have this exact light shader when we encounter it later.
          // Reusing its uniforms is correct; injecting declarations twice is
          // a GLSL compile error on real streamed buildings.
          if(shader.fragmentShader.includes('uniform float soraClusterLightStrength'))return;
          Object.assign(shader.uniforms,{soraClusterLightStrength:strength,soraClusterDiffuseBands:diffuseBands,
            soraClusterSpecularStrength:specularStrength,soraClusterSpecularBands:specularBands,soraClusterShadeTint:shadeTint,
            soraClusterRoughnessFloor:roughnessFloor,soraClusterClearcoatRoughnessFloor:clearcoatRoughnessFloor});
          shader.fragmentShader=declarations+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
            // Widen tiny BRDF lobes before Three evaluates direct and indirect
            // lighting. The floor is optional and never changes the material.
            if(soraClusterRoughnessFloor>0.){
              material.roughness=max(material.roughness,soraClusterRoughnessFloor*soraClusterLightStrength);
              #ifdef USE_ANISOTROPY
                // Three r186 derives this from roughness in lights_physical_fragment.
                material.alphaT=mix(pow2(material.roughness),1.,pow2(material.anisotropy));
              #endif
            }
            #ifdef USE_CLEARCOAT
              if(soraClusterClearcoatRoughnessFloor>0.)
                material.clearcoatRoughness=max(material.clearcoatRoughness,
                  soraClusterClearcoatRoughnessFloor*soraClusterLightStrength);
            #endif
            soraClusterDiffuseAlbedo=material.diffuseContribution;
            if(soraClusterLightStrength>0.)material.diffuseContribution=vec3(1.);
          `);
          shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
            if(soraClusterLightStrength>0.){
              // Preserve diffuse surface detail by grouping illumination before
              // applying albedo. Dark paint and pure metal require no division.
              vec3 illumination=reflectedLight.directDiffuse+reflectedLight.indirectDiffuse;
              float indirectShare=soraLightLuma(reflectedLight.indirectDiffuse)/max(soraLightLuma(illumination),.000001);
              // Only the existing indirect contribution receives shade color.
              // Keep its luminance and the original albedo; no ambient fill is
              // invented in unlit recesses, and black/metal stay black/metal.
              vec3 cool=vec3(.74,.79,1.15);cool/=soraLightLuma(cool);
              vec3 shade=reflectedLight.directDiffuse+mix(reflectedLight.indirectDiffuse,
                cool*soraLightLuma(reflectedLight.indirectDiffuse),soraClusterShadeTint);
              vec3 planes=soraLightPlanes(shade,soraClusterDiffuseBands);
              vec3 styled=mix(illumination,planes,soraClusterLightStrength)*soraClusterDiffuseAlbedo;
              // A scalar split preserves newly tinted channels even under
              // saturated one-channel light; componentwise ratios cannot.
              reflectedLight.directDiffuse=styled*(1.-indirectShare);
              reflectedLight.indirectDiffuse=styled*indirectShare;
              material.diffuseContribution=soraClusterDiffuseAlbedo;
              // Broad rough reflections otherwise become isolated hot islands.
              // Keep this treatment on resolved glossy highlights.
              float glossBlend=soraClusterLightStrength*soraClusterSpecularStrength*(1.-smoothstep(.45,.85,material.roughness));
              reflectedLight.directSpecular=mix(reflectedLight.directSpecular,
                soraLightPlanes(reflectedLight.directSpecular,soraClusterSpecularBands),glossBlend);
              reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
                soraLightPlanes(reflectedLight.indirectSpecular,soraClusterSpecularBands),glossBlend);
              #ifdef USE_CLEARCOAT
                float coatBlend=soraClusterLightStrength*soraClusterSpecularStrength*(1.-smoothstep(.45,.85,material.clearcoatRoughness));
                clearcoatSpecularDirect=mix(clearcoatSpecularDirect,
                  soraLightPlanes(clearcoatSpecularDirect,soraClusterSpecularBands),coatBlend);
                clearcoatSpecularIndirect=mix(clearcoatSpecularIndirect,
                  soraLightPlanes(clearcoatSpecularIndirect,soraClusterSpecularBands),coatBlend);
              #endif
            }
          `);
        };
        const installedKey=()=>disposed||strength.value<=0?entry.priorKey:`${entry.priorKey}:sora-clustered-light-v7:${programGeneration}`;
        entry.installed=installed;entry.installedKey=installedKey;entries.set(material,entry);
        if(strength.value>0){material.onBeforeCompile=installed;material.customProgramCacheKey=installedKey;entry.attached=true;material.needsUpdate=true;}
      }
    });},
    dispose(){disposed=true;strength.value=0;for(const [material,entry] of entries){
      if(material.onBeforeCompile===entry.installed)material.onBeforeCompile=entry.compile;
      if(material.customProgramCacheKey===entry.installedKey)material.customProgramCacheKey=entry.key;
      material.needsUpdate=true;
    }entries.clear();},
  };
}
