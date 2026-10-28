import { paintedHighlightDeclarations } from './painted-highlights';

/** Source-light painting for enamel panels, composed inside painted-surfaces. */
export const bodyworkDeclarations = /* glsl */ `
  uniform float soraBodyworkStrength;
  uniform float soraHighlightPaintStrength;
  varying vec3 vBodyworkNormal;
  ${paintedHighlightDeclarations}
  // Group the actual reflected radiance, including the clearcoat lobe. The
  // physical lights still place the highlight; attached strokes break its ramp.
  vec3 bodyworkReflection(vec3 radiance, float stroke) {
    float energy = dot(radiance, vec3(.2126,.7152,.0722));
    float level = log2(1. + energy * 12.) * 2.8;
    float brokenLevel = level + (stroke - .5) * .65;
    float footprint = max(fwidth(brokenLevel), .035);
    float phase = fract(brokenLevel);
    float stepWidth = clamp(footprint * .7, .045, .25);
    float band = floor(brokenLevel) + smoothstep(.40-stepWidth,.60+stepWidth,phase);
    float grouped = (exp2(max(band,0.) / 2.8) - 1.) / 12.;
    // Unresolved bands revert to their physical continuous source.
    float resolve = 1. - smoothstep(.45,1.3,footprint);
    vec3 originalPaint = radiance * mix(1., grouped/max(energy,.0001), .82*resolve);
    if (soraHighlightPaintStrength <= 0.) return originalPaint;
    vec3 paintedReflection = boundedPaintReflection(radiance,stroke);
    return mix(originalPaint,paintedReflection,soraHighlightPaintStrength);
  }
`;

export const bodyworkColor = /* glsl */ `
  float bodyworkBlend = soraPaintStrength * soraBodyworkStrength;
  vec3 bodyworkWeights = pow(abs(normalize(vBodyworkNormal)),vec3(8.));
  bodyworkWeights /= max(dot(bodyworkWeights,vec3(1.)),.001);
  // Long/short brush directions follow the side, hood and end panels. A
  // continuous triplanar blend avoids projection seams around the wheel arches.
  vec3 bodyworkP = vPigmentPosition;
  float bodyworkStroke = dot(bodyworkWeights, vec3(
    pigmentNoise(vec3(bodyworkP.zy * vec2(7.,28.),1.7)),
    pigmentNoise(vec3(bodyworkP.xz * vec2(24.,6.),4.1)),
    pigmentNoise(vec3(bodyworkP.xy * vec2(7.,28.),8.3))));
  float bodyworkFootprint = max(length(dFdx(bodyworkP)),length(dFdy(bodyworkP)));
  bodyworkStroke = mix(.5,bodyworkStroke,1.-smoothstep(.3,1.1,bodyworkFootprint*28.));
  bodyworkStroke=mix(bodyworkStroke,authoredMark,soraPaintMarksStrength);
  float bodyworkBroadStroke = dot(bodyworkWeights,vec3(
    pigmentNoise(vec3(bodyworkP.zy*vec2(1.5,6.),2.4)),
    pigmentNoise(vec3(bodyworkP.xz*vec2(6.,1.5),5.6)),
    pigmentNoise(vec3(bodyworkP.xy*vec2(1.5,6.),9.8))));
  bodyworkBroadStroke = mix(.5,bodyworkBroadStroke,1.-smoothstep(.3,1.1,bodyworkFootprint*6.));
  bodyworkBroadStroke=mix(bodyworkBroadStroke,authoredMark,soraPaintMarksStrength*.85);
  float bodyworkReflectionStroke = mix(bodyworkBroadStroke,bodyworkStroke,.15);
  float bodyworkMacro = mix(.5,pigmentNoise(bodyworkP*vec3(2.4,5.,2.)),
    1.-smoothstep(.3,1.1,bodyworkFootprint*5.));
  // Broad ivory panels remain clean. Marks enter at lighting transitions,
  // rather than spraying the entire albedo with workshop weathering.
  diffuseColor.rgb = mix(diffuseColor.rgb,
    bodyworkSourceColor.rgb * (1. + (bodyworkMacro-.5)*.018
      +(authoredMark-.5)*.12*soraPaintMarksStrength), bodyworkBlend);
`;

export const bodyworkLighting = /* glsl */ `
  vec3 bodyworkDiffuse = bodyworkDirectDiffuse + bodyworkIndirectDiffuse;
  float bodyworkAlbedo = max(dot(material.diffuseColor,vec3(.2126,.7152,.0722)),.028);
  float bodyworkEnergy = dot(bodyworkDiffuse,vec3(.2126,.7152,.0722));
  float bodyworkLight = bodyworkEnergy/bodyworkAlbedo;
  float bodyworkLevel = log2(1.+bodyworkLight*2.)*3.8;
  float bodyworkBroken = bodyworkLevel+(bodyworkStroke-.5)*.64+(bodyworkMacro-.5)*.32;
  float bodyworkBandWidth = clamp(fwidth(bodyworkBroken)*.65,.045,.20);
  float bodyworkBand = floor(bodyworkBroken)
    + smoothstep(.38-bodyworkBandWidth,.58+bodyworkBandWidth,fract(bodyworkBroken));
  float bodyworkGrouped = (exp2(max(bodyworkBand,0.)/3.8)-1.)*.5;
  float bodyworkResolve = 1.-smoothstep(.5,1.4,fwidth(bodyworkBroken));
  float bodyworkRatio = mix(1.,bodyworkGrouped/max(bodyworkLight,.001),.48*bodyworkResolve);
  float bodyworkPlaneLevel=log2(1.+bodyworkLight*2.)*1.9+(bodyworkBroadStroke-.5)*mix(.45,1.15,soraPaintMarksStrength);
  float bodyworkPlaneFootprint=fwidth(bodyworkPlaneLevel);
  float bodyworkPlaneAA=clamp(bodyworkPlaneFootprint*.65,.025,.20);
  float bodyworkPlaneBand=floor(bodyworkPlaneLevel)
    +smoothstep(.46-bodyworkPlaneAA,.54+bodyworkPlaneAA,fract(bodyworkPlaneLevel));
  float bodyworkPlaneValue=(exp2(max(0.,bodyworkPlaneBand)/1.9)-1.)*.5;
  float bodyworkPlaneGain=clamp(bodyworkPlaneValue/max(bodyworkLight,.001),.62,1.5);
  float bodyworkPlaneResolve=1.-smoothstep(.45,1.2,bodyworkPlaneFootprint);
  float bodyworkPlaneRatio=mix(1.,bodyworkPlaneGain,
    .96*bodyworkPlaneResolve*smoothstep(.004,.045,bodyworkLight));
  bodyworkRatio=mix(bodyworkRatio,bodyworkPlaneRatio,soraIllustrationStrength);
  // Tint only the weakly lit enamel. Strong key-light ivory and source hue
  // remain intact; the reflected fill supplies the cool side of the form.
  float bodyworkShade = 1.-smoothstep(.10,.75,bodyworkLight);
  vec3 bodyworkTint = mix(vec3(1.),vec3(.91,.95,1.04),bodyworkShade*.45);
  vec3 bodyworkPlaneTint=mix(vec3(.76,.84,1.17),vec3(1.04,1.,.95),smoothstep(.10,1.,bodyworkLight));
  bodyworkTint=mix(bodyworkTint,bodyworkPlaneTint,soraIllustrationStrength*.70);
  reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse,
    bodyworkDirectDiffuse*bodyworkRatio*bodyworkTint,bodyworkBlend);
  reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse,
    bodyworkIndirectDiffuse*bodyworkRatio*bodyworkTint,bodyworkBlend);
  reflectedLight.directSpecular = mix(reflectedLight.directSpecular,
    bodyworkReflection(bodyworkDirectSpecular,bodyworkReflectionStroke),bodyworkBlend);
  reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular,
    bodyworkReflection(bodyworkIndirectSpecular,bodyworkReflectionStroke),bodyworkBlend);
  #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect = mix(clearcoatSpecularDirect,
      bodyworkReflection(clearcoatSpecularDirect,bodyworkReflectionStroke),bodyworkBlend);
    clearcoatSpecularIndirect = mix(clearcoatSpecularIndirect,
      bodyworkReflection(clearcoatSpecularIndirect,bodyworkReflectionStroke),bodyworkBlend);
  #endif
`;
