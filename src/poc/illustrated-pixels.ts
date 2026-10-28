/**
 * Paint clusters may span two samples, while lettering, thin metal catches and
 * silhouettes keep the original pixel grid. The reference has both scales;
 * a uniform half-resolution image discards its characteristic fine detail.
 */
export const illustratedPixelShader=/* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  uniform float detailPreservation;
  varying vec2 vUv;
  void main(){
    vec2 cell=floor(floor(vUv*resolution)/2.)*2.;
    vec2 last=resolution-.5;
    vec4 a=texture2D(tDiffuse,min(cell+vec2(.5,.5),last)/resolution);
    vec4 b=texture2D(tDiffuse,min(cell+vec2(1.5,.5),last)/resolution);
    vec4 c=texture2D(tDiffuse,min(cell+vec2(.5,1.5),last)/resolution);
    vec4 d=texture2D(tDiffuse,min(cell+vec2(1.5,1.5),last)/resolution);
    vec3 low=min(min(a.rgb,b.rgb),min(c.rgb,d.rgb));
    vec3 high=max(max(a.rgb,b.rgb),max(c.rgb,d.rgb));
    float contrast=max(high.r-low.r,max(high.g-low.g,high.b-low.b));
    float keep=smoothstep(.018,.075,contrast)*detailPreservation;
    vec4 clustered=(a+b+c+d)*.25;
    vec2 nativeUv=(min(floor(vUv*resolution),resolution-1.)+.5)/resolution;
    vec4 fine=texture2D(tDiffuse,nativeUv);
    gl_FragColor=mix(clustered,fine,keep);
  }
`;
