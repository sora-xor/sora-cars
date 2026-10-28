import * as THREE from 'three';

/** Unique painting on the licensed car's original, non-stacked UV islands. */
export async function loadIllustratedEnamel(): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(
    '/assets/materials/painted-workshop/ae86-enamel-v1.png',
  );
  texture.name = 'AE86 / uniquely painted enamel islands';
  texture.colorSpace = THREE.SRGBColorSpace;
  // The generated guide explicitly places V=0 at the bottom of the PNG.
  texture.flipY = true;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  return texture;
}

export const enamelVertexDeclarations = /* glsl */`
  attribute vec3 enamelRestPosition;
  attribute vec2 enamelForm;
  varying vec2 vEnamelUv;
  varying vec2 vEnamelForm;
  varying vec3 vEnamelRest;
`;

export const enamelVertex = /* glsl */`
  vEnamelUv = uv;
  vEnamelForm = enamelForm;
  vEnamelRest = enamelRestPosition;
`;

export const enamelDeclarations = /* glsl */`
  uniform sampler2D soraEnamelAtlas;
  uniform vec3 soraEnamelAtlasBase;
  uniform float soraEnamelStrength;
  uniform float soraEnamelNormalStrength;
  uniform float soraEnamelClearcoatNormalStrength;
  uniform float soraEnamelSurfaceStrength;
  varying vec2 vEnamelUv;
  varying vec2 vEnamelForm;
  varying vec3 vEnamelRest;
  vec3 enamelAtlasRatio;
  float enamelRidge;
  float enamelCavity;
  float enamelBlend;
  float enamelLightingMark;
  float enamelClearcoatStrokeMask;
  vec3 enamelClearcoatNormalOffset;

  // Recover the painted UV frame from the actual deformed surface, in view
  // space. Applying the determinant sign preserves mirrored UV orientation;
  // normalizing removes the derivative scale without dividing by tiny areas.
  bool enamelTangentFrame(vec3 n,vec3 p,vec2 uv,out vec3 t,out vec3 b){
    vec3 px=dFdx(p),py=dFdy(p);
    vec2 ux=dFdx(uv),uy=dFdy(uv);
    float determinant=ux.x*uy.y-ux.y*uy.x;
    t=(px*uy.y-py*ux.y)*sign(determinant);
    b=(py*ux.x-px*uy.x)*sign(determinant);
    t-=n*dot(n,t);
    float tangentLength=dot(t,t);
    if(abs(determinant)<1.e-12||tangentLength<1.e-16){
      t=vec3(0.);b=vec3(0.);return false;
    }
    t*=inversesqrt(tangentLength);
    b-=n*dot(n,b)+t*dot(t,b);
    float bitangentLength=dot(b,b);
    if(bitangentLength<1.e-16){b=vec3(0.);return false;}
    b*=inversesqrt(bitangentLength);
    return true;
  }
`;

export const enamelAlbedo = /* glsl */`
  enamelBlend=soraEnamelStrength*soraIllustrated;
  enamelAtlasRatio=vec3(1.);
  enamelLightingMark=.5;
  enamelClearcoatStrokeMask=0.;
  enamelClearcoatNormalOffset=vec3(0.);
  enamelRidge=smoothstep(.20,.78,vEnamelForm.x);
  enamelCavity=smoothstep(.20,.78,vEnamelForm.y);
  if(enamelBlend>0.){
    vec4 enamelSample=texture2D(soraEnamelAtlas,vEnamelUv);
    vec3 paintedAlbedo=mix(soraEnamelAtlasBase,enamelSample.rgb,enamelSample.a);
    // The texture supplies variation around its own ivory underpainting.
    // Material colour and the actual incident light still determine the car.
    enamelAtlasRatio=clamp(paintedAlbedo/max(soraEnamelAtlasBase,vec3(.001)),.42,1.60);
    float enamelAtlasTone=dot(enamelAtlasRatio,vec3(.2126,.7152,.0722));
    // The painting primarily directs light transitions. A small albedo
    // residual keeps quiet panels from inheriting the atlas's baked shading.
    enamelLightingMark=mix(.5,clamp(.5+(enamelAtlasTone-1.)*1.5,.05,.95),enamelBlend);
    float enamelFormPaint=clamp(enamelRidge+enamelCavity,.0,1.);
    float enamelQuietPaint=mix(.12,.60,soraEnamelSurfaceStrength);
    float enamelAlbedoAmount=mix(enamelQuietPaint,.72,enamelFormPaint)*enamelBlend;
    vec3 variation=mix(vec3(1.),enamelAtlasRatio,enamelAlbedoAmount);
    // Local recessed folds receive a restrained violet underpainting. This is
    // albedo, so it vanishes with incoming light instead of emitting in shade.
    variation*=mix(vec3(1.),vec3(.88,.90,1.02),enamelCavity*enamelBlend*.45);
    diffuseColor.rgb*=variation;
  }
`;

export const enamelArtistNormal = /* glsl */`
  // The UV painting supplies a plane direction, not a height-map derivative.
  // Diffuse planes stay calm; clearcoat has a separate, sparse accent layer.
  vec3 enamelTangent,enamelBitangent;
  bool enamelFrameValid=enamelTangentFrame(normal,-vViewPosition,vEnamelUv,
    enamelTangent,enamelBitangent);
  float enamelResolve=1.-smoothstep(.025,.08,
    max(length(dFdx(vEnamelRest)),length(dFdy(vEnamelRest))));
  float enamelTone=dot(enamelAtlasRatio,vec3(.2126,.7152,.0722));
  vec2 enamelPlane=clamp(vec2(enamelAtlasRatio.r-enamelAtlasRatio.b,
    enamelTone-1.)*1.5,vec2(-.5),vec2(.5));
  float enamelFrameWeight=enamelFrameValid?1.:0.;
  vec3 enamelNormalOffset=(enamelTangent*enamelPlane.x+enamelBitangent*enamelPlane.y)
    *clamp(soraEnamelNormalStrength,0.,.025)*enamelBlend*enamelResolve*enamelFrameWeight;

  // Only the atlas's light paint on convex forms can move the coat normal.
  // Cavity paint and quiet flat fills do not acquire glitter or granular bump.
  float enamelAccentWidth=max(.018,fwidth(enamelTone)*.75);
  float enamelBrightStroke=smoothstep(1.035-enamelAccentWidth,
    1.095+enamelAccentWidth,enamelTone);
  enamelClearcoatStrokeMask=enamelBrightStroke*enamelRidge*(1.-enamelCavity)
    *enamelBlend*enamelResolve*enamelFrameWeight;
  vec3 enamelCoatDirection=enamelTangent*.8+enamelBitangent*enamelPlane.y*.4;
  enamelClearcoatNormalOffset=enamelCoatDirection
    *clamp(soraEnamelClearcoatNormalStrength,0.,.15)*enamelClearcoatStrokeMask;
  #ifdef DOUBLE_SIDED
    enamelNormalOffset*=faceDirection;
    enamelClearcoatNormalOffset*=faceDirection;
  #endif
  normal=normalize(normal+enamelNormalOffset);
`;

/**
 * Insert after clearcoat_normal_fragment_maps instead of the generic brush
 * perturbation for painted enamel. The caller gates accent color/energy using
 * the real clearcoat light contribution and enamelClearcoatStrokeMask.
 */
export const enamelClearcoatNormal = /* glsl */`
  #ifdef USE_CLEARCOAT
    vec3 enamelCoatOffset=enamelClearcoatNormalOffset
      -clearcoatNormal*dot(clearcoatNormal,enamelClearcoatNormalOffset);
    clearcoatNormal=normalize(clearcoatNormal+enamelCoatOffset);
  #endif
`;
