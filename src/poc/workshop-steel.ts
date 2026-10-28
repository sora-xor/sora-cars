import * as THREE from 'three';

/** Project the authored pigment at a consistent metre scale onto steel geometry. */
export async function loadWorkshopSteel() {
  const texture=await new THREE.TextureLoader().loadAsync('/assets/materials/painted-workshop/steel-v1.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
  texture.name='Painted blue-charcoal workshop enamel';
  return (tint='#c9d1e0',roughness=.78)=>{
    const material=new THREE.MeshStandardMaterial({color:tint,map:texture,roughness,metalness:.16});
    material.name='Painted workshop enamel';
    material.onBeforeCompile=shader=>{
      shader.vertexShader=`varying vec3 vWorkshopPosition;\n${shader.vertexShader}`;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`
        #include <worldpos_vertex>
        vWorkshopPosition=(modelMatrix*vec4(transformed,1.)).xyz;
      `);
      shader.fragmentShader=/* glsl */`
        varying vec3 vWorkshopPosition;
        vec3 workshopTile(sampler2D tex,vec2 uv){
          // At each repeat boundary the offset sample takes over, avoiding a
          // hard line even if the generated swatch is not perfectly seamless.
          vec2 a=fract(uv),b=fract(uv+.5);
          vec2 wa=smoothstep(vec2(0.),vec2(.16),min(a,1.-a));
          vec2 wb=smoothstep(vec2(0.),vec2(.16),min(b,1.-b));
          float x=wa.x*wa.y,y=wb.x*wb.y;
          return (texture2D(tex,uv).rgb*x+texture2D(tex,uv+.5).rgb*y)/max(x+y,.0001);
        }
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',/* glsl */`
        vec3 workshopNormal=abs(normalize(cross(dFdx(vWorkshopPosition),dFdy(vWorkshopPosition))));
        vec3 workshopWeights=pow(workshopNormal,vec3(6.));
        workshopWeights/=max(dot(workshopWeights,vec3(1.)),.0001);
        vec3 workshopUV=vWorkshopPosition/2.7;
        vec3 workshopColor=workshopTile(map,workshopUV.zy)*workshopWeights.x
          +workshopTile(map,workshopUV.xz+vec2(.17,.31))*workshopWeights.y
          +workshopTile(map,workshopUV.xy+vec2(.63,.12))*workshopWeights.z;
        diffuseColor.rgb*=workshopColor;
      `);
    };
    material.customProgramCacheKey=()=> 'sora-workshop-triplanar-steel-v1';
    return material;
  };
}
