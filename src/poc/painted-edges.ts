/** Broken, light-dependent catches on the actual rounded edges of workshop objects. */
export const paintedEdgeDeclarations = /* glsl */ `
  uniform float soraEdgePaintStrength;
  // The normal is geometric, before normal mapping. The tangent metric makes
  // the estimate a physical curvature rather than a screen-space outline.
  vec2 paintedConvexCurvature(vec3 position, vec3 geometricNormal) {
    vec3 a=dFdx(position),b=dFdy(position);
    vec3 nx=dFdx(geometricNormal),ny=dFdy(geometricNormal);
    float scale=max(max(length(a),length(b)),.00001);
    a/=scale;b/=scale;
    float e=dot(a,a),f=dot(a,b),g=dot(b,b);
    float determinant=max(0.,e*g-f*f);
    float conditioning=determinant/max(e*g,.00001);
    float trace=(dot(g*a-f*b,nx)+dot(e*b-f*a,ny))
      /max(determinant,.00001)/scale;
    float resolved=1.-smoothstep(.30,.70,max(length(nx),length(ny)));
    // Confidence scales the final mark, not curvature before its threshold:
    // an unresolved very sharp edge must not jump back to full brightness.
    return vec2(max(0.,trace*.5),smoothstep(.03,.15,conditioning)*resolved);
  }
`;

export const paintedEdgeLighting = /* glsl */ `
  vec2 edgeCurvature=paintedConvexCurvature(-vViewPosition,normalize(nonPerturbedNormal));
  float edgeShape=smoothstep(8.,55.,edgeCurvature.x)*edgeCurvature.y;
  // Attached pigment selects a few chipped/caught marks along each bevel.
  // No mark is introduced on an unlit edge or over a flat normal-map texture.
  float edgeMark=smoothstep(.48,.76,pigmentTooth);
  float edgeMaterial=mix(.12,.60,smoothstep(.06,.75,metalness))
    *smoothstep(.15,.45,roughness);
  vec3 edgeDirect=reflectedLight.directDiffuse+reflectedLight.directSpecular;
  vec3 edgeIndirect=reflectedLight.indirectDiffuse+reflectedLight.indirectSpecular;
  float edgeLight=dot(edgeDirect+edgeIndirect*.32,vec3(.2126,.7152,.0722));
  float edgeGate=smoothstep(.015,.14,edgeLight)*(1.-smoothstep(1.3,3.,edgeLight));
  float edgeAmount=soraPaintStrength*soraEdgePaintStrength*edgeShape*edgeMark*edgeMaterial*edgeGate;
  // Colored real light supplies the paint. Mild warm direct/cool fill ratios
  // retain the light hue and cannot turn a shadowed bevel into an emitter.
  vec3 edgeCatch=edgeDirect*vec3(1.05,1.,.91)+edgeIndirect*vec3(.29,.31,.36);
  reflectedLight.directSpecular+=edgeCatch*edgeAmount;
`;
