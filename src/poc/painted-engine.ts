/** Cast-metal paint marks attached to real engine surfaces, before lighting. */
export const engineDeclarations = /* glsl */ `
  uniform float soraEnginePaintStrength;
  varying vec3 vEnginePaintNormal;
  vec2 engineHash(vec2 p) {
    vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
    q+=dot(q,q.yzx+33.33);
    return fract((q.xx+q.yz)*q.zy);
  }
  float engineDabs(vec2 p) {
    // Slowly varying rest-space warp breaks the regular rows without making
    // the brush direction depend on the viewing camera.
    p+=vec2(pigmentNoise(vec3(p*.23,2.7)),pigmentNoise(vec3(p*.19,8.1)))*1.3;
    vec2 cell=floor(p),local=fract(p)-.5,seed=engineHash(cell);
    // Short irregular strokes with quiet gaps. Footprint filtering and a
    // continuous fade keep subpixel strokes from becoming moving glitter.
    local+=vec2((seed.x-.5)*.18,(seed.y-.5)*.14);
    float angle=(seed.y-.5)*.7;
    local=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*local;
    vec2 extent=vec2(.22+seed.x*.15,.12+seed.y*.16);
    float edge=max(max(abs(local.x)-extent.x,abs(local.y)-extent.y),
      dot(abs(local),vec2(.48,1.))-dot(extent,vec2(.38,1.)));
    float footprint=max(length(dFdx(p)),length(dFdy(p)));
    float aa=max(fwidth(edge)*.65,.025);
    float dab=(1.-smoothstep(-aa,aa,edge))*smoothstep(.28,.67,seed.x);
    return mix(.17,dab,1.-smoothstep(.45,1.2,footprint));
  }
  vec3 enginePaintRadiance(vec3 radiance,float stroke,float amount) {
    float energy=dot(radiance,vec3(.2126,.7152,.0722));
    float level=log2(1.+energy*22.)*2.4+(stroke-.17)*.52;
    float footprint=fwidth(level);
    float aa=clamp(footprint*.65,.04,.22);
    float groupedLevel=floor(level)+smoothstep(.43-aa,.57+aa,fract(level));
    float grouped=(exp2(max(0.,groupedLevel)/2.4)-1.)/22.;
    float resolved=1.-smoothstep(.45,1.3,footprint);
    // The stroke phase cannot amplify tiny nonzero cavity radiance into a
    // bright mark. Both the gain bound and incident-energy gate are deliberate.
    float gain=clamp(grouped/max(energy,.0001),.62,1.70);
    float lit=smoothstep(.001,.015,energy);
    return radiance*mix(1.,gain,amount*resolved*lit);
  }
`;

export const engineColor = /* glsl */ `
  float engineBlend=soraPaintStrength*soraEnginePaintStrength;
  vec3 engineP=vPigmentPosition;
  vec3 engineWeights=pow(abs(normalize(vEnginePaintNormal)),vec3(6.));
  engineWeights/=max(dot(engineWeights,vec3(1.)),.001);
  float engineStroke=dot(engineWeights,vec3(
    engineDabs(engineP.zy*vec2(42.,110.)+3.1),
    engineDabs(engineP.xz*vec2(110.,42.)+8.2),
    engineDabs(engineP.xy*vec2(42.,110.)+19.4)));
  float engineCoarse=dot(engineWeights,vec3(
    engineDabs(engineP.zy*vec2(14.,38.)+1.7),
    engineDabs(engineP.xz*vec2(38.,14.)+5.4),
    engineDabs(engineP.xy*vec2(14.,38.)+12.9)));
  float engineBrush=engineCoarse*.82+engineStroke*.18;
  // Keep the source material colour; only selected metallic engine surfaces
  // participate. Rubber, leads, enamel and lettering retain earlier treatment.
  vec3 engineColorScale=mix(vec3(.94,.96,1.02),vec3(1.10,1.04,.94),engineCoarse);
  engineColorScale*=1.+(engineStroke-.17)*.14;
  diffuseColor.rgb=mix(diffuseColor.rgb,engineSourceColor.rgb*engineColorScale,engineBlend);
`;

export const engineRoughness = /* glsl */ `
  // Alternating abraded marks and untouched casting make real reflections
  // break into distinct shapes instead of merely tinting a smooth surface.
  float engineRough=clamp(roughnessFactor+.06-engineStroke*.09-engineCoarse*.20,.24,.94);
  roughnessFactor=mix(roughnessFactor,engineRough,engineBlend);
`;

export const engineNormal = /* glsl */ `
  vec3 engineDx=dFdx(-vViewPosition),engineDy=dFdy(-vViewPosition);
  vec3 engineRx=cross(engineDy,normal),engineRy=cross(normal,engineDx);
  float engineDet=dot(engineDx,engineRx);
  // Shallow casting relief (0.08 mm), resolved in view-space metres. Retains
  // geometric form and changes the physical highlight before paint grouping.
  float engineHeight=engineBrush*.00008*engineBlend;
  vec3 engineGrad=sign(engineDet)*(dFdx(engineHeight)*engineRx+dFdy(engineHeight)*engineRy);
  if(abs(engineDet)>.0000000001) normal=normalize(abs(engineDet)*normal-engineGrad);
`;

export const engineLighting = /* glsl */ `
  // Group the actual warm key and cool reflected radiance independently.
  // Dark cavities stay dark; no highlight is invented without source light.
  reflectedLight.directDiffuse=mix(reflectedLight.directDiffuse,
    enginePaintRadiance(engineDirectDiffuse,engineCoarse,mix(.40,.92,soraIllustrationStrength)),engineBlend);
  reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,
    enginePaintRadiance(engineIndirectDiffuse,engineCoarse,mix(.20,.55,soraIllustrationStrength)),engineBlend);
  reflectedLight.directSpecular=mix(reflectedLight.directSpecular,
    enginePaintRadiance(engineDirectSpecular,engineBrush,.88),engineBlend);
  reflectedLight.indirectSpecular=mix(reflectedLight.indirectSpecular,
    enginePaintRadiance(engineIndirectSpecular,engineBrush,.76),engineBlend);
`;
