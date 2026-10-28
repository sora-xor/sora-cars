import * as THREE from 'three';

/** Authored reflection palette/shape, used on moving 3D normals, not a backdrop. */
export async function loadIllustratedReflections(){
  const texture=await new THREE.TextureLoader().loadAsync('/assets/materials/painted-workshop/reflection-matcap-v1.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.name='Painted amber/violet reflection response';
  return texture;
}

export const illustratedReflectionDeclarations=/* glsl */`
  uniform sampler2D soraIllustratedReflection;
  uniform float soraIllustratedReflectionStrength;
  vec3 illustratedReflection(vec3 n,vec3 viewDirection){
    vec3 view=normalize(viewDirection);
    vec3 x=normalize(vec3(view.z,0.,-view.x)+vec3(.00001,0.,0.));
    vec3 y=cross(view,x);
    // The painted sphere occupies 96% of the source square; stay inside its rim.
    vec2 uv=vec2(dot(x,n),dot(y,n))*.476+.5;
    return texture2D(soraIllustratedReflection,uv).rgb;
  }
`;
