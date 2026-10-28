import * as THREE from 'three';

/** Authored color only; lighting and relief come from the floor material. */
export async function loadWorkshopConcrete(): Promise<THREE.Texture> {
  const texture=await new THREE.TextureLoader().loadAsync(
    '/assets/materials/painted-workshop/concrete-v1.png',
  );
  texture.name='Painted workshop concrete albedo';
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=8;
  return texture;
}

/** Inject once into a fragment shader; worldXZ and tileMetres are in metres. */
export const workshopConcreteShader=/* glsl */`
  vec3 sampleWorkshopConcrete(sampler2D tex,vec2 worldXZ,float tileMetres){
    float tileSize=max(abs(tileMetres),.001);
    vec2 uv=worldXZ/tileSize;
    // Derivatives must come from the continuous projection, never fract(uv).
    // This keeps wrap boundaries from selecting an artificially blurry mip.
    vec2 uvDx=dFdx(worldXZ)/tileSize,uvDy=dFdy(worldXZ)/tileSize;
    vec2 local=fract(uv);
    vec2 borderDistance=min(local,1.-local);
    // Use a half-tile shift only close to each source boundary. That shifted
    // sample's own wrap at local=.5 is completely absent from the result.
    // The flat inner strip also excludes the source's bilinear edge footprint.
    vec2 shiftWeight=1.-smoothstep(vec2(.025),vec2(.09),borderDistance);
    vec3 c00=textureGrad(tex,uv,uvDx,uvDy).rgb;
    vec3 c10=textureGrad(tex,uv+vec2(.5,0.),uvDx,uvDy).rgb;
    vec3 c01=textureGrad(tex,uv+vec2(0.,.5),uvDx,uvDy).rgb;
    vec3 c11=textureGrad(tex,uv+vec2(.5,.5),uvDx,uvDy).rgb;
    // Four tensor-product weights cover the diagonal seam intersections too.
    // They sum to one without normalization or a division-zero fallback.
    // The sRGB texture is decoded by the sampler; blend these linear colors.
    return mix(mix(c00,c10,shiftWeight.x),mix(c01,c11,shiftWeight.x),shiftWeight.y);
  }
`;
