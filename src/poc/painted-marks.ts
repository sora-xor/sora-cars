import * as THREE from 'three';

/** Achromatic brush marks are data for painted lighting, not baked scene art. */
export async function loadPaintedMarks(): Promise<THREE.Texture> {
  const texture=await new THREE.TextureLoader().loadAsync('/assets/materials/painted-workshop/pigment-marks-v1.png');
  texture.name='Authored chisel-brush pigment clusters';
  texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=8;
  return texture;
}

export const paintedMarkDeclarations=/* glsl */ `
  uniform sampler2D soraPaintMarks;
  uniform float soraPaintMarksStrength;
  varying vec3 vPigmentNormal;
  float authoredPaintMarks(vec3 p,vec3 n){
    vec3 weights=pow(abs(normalize(n)),vec3(6.));
    weights/=max(dot(weights,vec3(1.)),.001);
    // A 3.2m tile resolves centimetre paint clusters. The material's rest
    // coordinates keep them attached during camera and object motion.
    vec3 q=p/3.2;
    vec3 marks=vec3(texture2D(soraPaintMarks,q.zy+vec2(.17,.39)).r,
      texture2D(soraPaintMarks,q.xz+vec2(.53,.11)).r,
      texture2D(soraPaintMarks,q.xy+vec2(.31,.67)).r);
    return clamp(.5+(dot(weights,marks)-.5)*2.0,.05,.95);
  }

  float authoredPaintPatches(vec3 p,vec3 n){
    vec3 weights=pow(abs(normalize(n)),vec3(6.));
    weights/=max(dot(weights,vec3(1.)),.001);
    // Read the same artist-painted field at the scale of a brush load, not
    // its individual bristles. A fixed material-space footprint keeps these
    // patches attached and lets normal mip selection take over at distance.
    vec3 q=p/3.2,dx=dFdx(q),dy=dFdy(q);
    float sx=max(1.,.006/max(length(dx),.00001));
    float sy=max(1.,.006/max(length(dy),.00001));
    vec3 marks=vec3(textureGrad(soraPaintMarks,q.zy+vec2(.17,.39),dx.zy*sx,dy.zy*sy).r,
      textureGrad(soraPaintMarks,q.xz+vec2(.53,.11),dx.xz*sx,dy.xz*sy).r,
      textureGrad(soraPaintMarks,q.xy+vec2(.31,.67),dx.xy*sx,dy.xy*sy).r);
    // Raw-channel median of pigment-marks-v1, sampled as linear data.
    return clamp(.5+(dot(weights,marks)-.45490196)*2.4,.05,.95);
  }
`;
