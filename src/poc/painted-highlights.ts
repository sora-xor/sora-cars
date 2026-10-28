/** Bounded paint values for actual reflected radiance, before tone mapping. */
export const paintedHighlightDeclarations = /* glsl */ `
  vec3 boundedPaintReflection(vec3 radiance, float stroke) {
    float energy=dot(radiance,vec3(.2126,.7152,.0722));
    const float pigmentCeiling=.90;
    const float weakReflection=.035;
    float paintSource=max(energy-weakReflection,0.);
    float pigmentSpan=pigmentCeiling-weakReflection;
    float boundedEnergy=paintSource/(1.+paintSource/pigmentSpan);
    float paintLevel=sqrt(max(boundedEnergy/pigmentSpan,0.))*6.+(stroke-.5)*.22;
    float paintFootprint=fwidth(paintLevel);
    float paintAA=clamp(paintFootprint*.7,.035,.22);
    float paintBand=floor(paintLevel)+smoothstep(.45-paintAA,.55+paintAA,fract(paintLevel));
    float paintValue=pow(clamp(paintBand/6.,0.,1.),2.)*pigmentSpan;
    float paintResolve=1.-smoothstep(.45,1.2,paintFootprint);
    float paintedEnergy=mix(boundedEnergy,paintValue,.94*paintResolve);
    // No source reflection is amplified. Preserve hue and weak radiance;
    // the ramp only bounds and groups the brighter reflected light.
    paintedEnergy=min(energy,min(energy,weakReflection)+paintedEnergy);
    float gain=mix(1.,paintedEnergy/max(energy,.000001),step(weakReflection,energy));
    return radiance*gain;
  }
`;
