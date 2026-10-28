import { cutscenePaletteDeclarations } from './cutscene-palette';

/** Bespoke painted-pixel finish. Input is the fully shaded, tone-mapped 3D image. */
export const cutsceneShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D sceneDepth;
  uniform sampler2D glazingMask;
  uniform float glazingMaskEnabled;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float cameraPerspective;
  uniform float finishStrength;
  uniform float painterStrength;
  uniform float referenceStyleStrength;
  varying vec2 vUv;
  ${cutscenePaletteDeclarations}

  float paintLuma(vec3 c) { return dot(c,vec3(.2126,.7152,.0722)); }
  float paintDepth(vec2 uv) { return texture2D(sceneDepth,clamp(uv,.5/resolution,1.-.5/resolution)).r; }
  float paintDistance(float d) {
    float perspective=cameraNear*cameraFar / max(cameraFar-d*(cameraFar-cameraNear),.000001);
    return mix(mix(cameraNear,cameraFar,d),perspective,cameraPerspective);
  }
  vec3 paintColor(vec2 uv) { return texture2D(tDiffuse,clamp(uv,.5/resolution,1.-.5/resolution)).rgb; }

  // Original bounded sector filter inspired by anisotropic Kuwahara filtering.
  // Each sector keeps its own colour moments. Continuous variance weights
  // favour coherent paint shapes without a hard, flickering winner selection.
  vec3 paintSectors(vec3 center, float distance, vec2 depthSlope, vec2 tangent,
                    float anisotropy, float detailGuard, vec2 px) {
    vec3 sums[8];vec3 squares[8];float weights[8];
    for(int k=0;k<8;k++){sums[k]=center*.65;squares[k]=center*center*.65;weights[k]=.65;}
    vec2 normal=vec2(-tangent.y,tangent.x);
    float radius=mix(mix(3.6,6.5,referenceStyleStrength),mix(2.0,2.7,referenceStyleStrength),detailGuard);
    float longAxis=radius*(1.+anisotropy*.45),shortAxis=radius/(1.+anisotropy*.40);
    for(int ring=0;ring<2;ring++)for(int j=0;j<16;j++){
      float angle=float(j)*.3926990817;
      vec2 direction=vec2(cos(angle),sin(angle));
      float radial=ring==0?.47:1.;
      vec2 offset=(tangent*direction.x*longAxis+normal*direction.y*shortAxis)*radial;
      vec2 uv=vUv+offset*px;
      vec3 sampleColor=paintColor(uv);
      float delta=paintDistance(paintDepth(uv))-distance-dot(offset,depthSlope);
      float geometryGate=exp(-abs(delta)/(.035+distance*.003));
      vec3 colorDelta=sampleColor-center;
      float colorGate=exp(-dot(colorDelta,colorDelta)*24.);
      float sampleWeight=geometryGate*colorGate*(ring==0?1.:.65);
      for(int k=0;k<8;k++){
        float sectorAngle=float(k)*.7853981634;
        float wedge=max(0.,dot(direction,vec2(cos(sectorAngle),sin(sectorAngle))));
        wedge*=wedge;wedge*=wedge;
        float weight=wedge*sampleWeight;
        sums[k]+=sampleColor*weight;squares[k]+=sampleColor*sampleColor*weight;weights[k]+=weight;
      }
    }
    vec3 result=vec3(0.);float total=0.;
    for(int k=0;k<8;k++){
      vec3 mean=sums[k]/max(weights[k],.0001);
      vec3 variance=max(squares[k]/max(weights[k],.0001)-mean*mean,vec3(0.));
      float uncertainty=dot(variance,vec3(.333333));
      float preference=1./pow(1.+uncertainty*1100.,2.5);
      // Random fine texture has no reliable direction. Equal sector weights
      // there avoid amplifying changes in an almost-isotropic tensor angle.
      float weight=mix(1.,preference,smoothstep(.08,.42,anisotropy));
      result+=mean*weight;total+=weight;
    }
    return result/max(total,.0001);
  }

  void main() {
    vec4 source=texture2D(tDiffuse,vUv);
    if(finishStrength<=0.) { gl_FragColor=source; return; }
    vec2 px=1./resolution;
    float d=paintDepth(vUv), distance=paintDistance(d);
    float surface=1.-step(.999999,d);
    vec3 c=source.rgb;
    float light=paintLuma(c);
    vec3 l=paintColor(vUv-vec2(px.x,0)),r=paintColor(vUv+vec2(px.x,0));
    vec3 b=paintColor(vUv-vec2(0,px.y)),t=paintColor(vUv+vec2(0,px.y));
    vec2 grad=vec2(paintLuma(r-l),paintLuma(t-b));
    vec2 tangent=normalize(vec2(-grad.y,grad.x)+vec2(.00001));

    // Short edge-following strokes. A bilateral gate protects small lettering,
    // panel seams and specular flecks instead of blurring them into oil blobs.
    vec3 stroke=c*2.; float weights=2.;
    for(int i=-2;i<=2;i++) {
      if(i==0) continue;
      vec2 q=vUv+tangent*px*float(i)*1.1;
      vec3 s=paintColor(q);
      float w=exp(-dot(s-c,s-c)*90.) * exp(-abs(paintDistance(paintDepth(q))-distance)*8.);
      stroke+=s*w;weights+=w;
    }
    vec3 grouped=stroke/weights;
    c=mix(c,grouped,.26);

    if(painterStrength>0.){
      vec3 tl=paintColor(vUv+vec2(-px.x,px.y)),tr=paintColor(vUv+px);
      vec3 bl=paintColor(vUv-px),br=paintColor(vUv+vec2(px.x,-px.y));
      // Average five colour-gradient tensors. Isotropic fine texture has low
      // coherence; a real contour supplies a consistent stroke direction.
      vec3 gx=r-l,gy=t-b;
      float e=dot(gx,gx)*2.,f=dot(gx,gy)*2.,g=dot(gy,gy)*2.;
      gx=t-tl;gy=tl-l;e+=dot(gx,gx);f+=dot(gx,gy);g+=dot(gy,gy);
      gx=tr-t;gy=tr-r;e+=dot(gx,gx);f+=dot(gx,gy);g+=dot(gy,gy);
      gx=b-bl;gy=l-bl;e+=dot(gx,gx);f+=dot(gx,gy);g+=dot(gy,gy);
      gx=br-b;gy=r-br;e+=dot(gx,gx);f+=dot(gx,gy);g+=dot(gy,gy);
      float trace=e+g;
      float tensorDirection=sqrt((e-g)*(e-g)+4.*f*f);
      float anisotropy=clamp(tensorDirection/max(trace,.00001),0.,1.);
      float angle=tensorDirection>.000001?.5*atan(2.*f,e-g):0.;
      vec2 paintTangent=vec2(-sin(angle),cos(angle));
      vec3 localMean=(l+r+b+t+tl+tr+bl+br)*.125;
      vec3 residual=source.rgb-localMean;
      float detailGuard=max(smoothstep(.045,.15,length(residual)),
        smoothstep(.16,.48,sqrt(trace))*anisotropy);
      // Bright thin glints and dark lettering retain the source residual.
      detailGuard=max(detailGuard,smoothstep(.87,.97,light));
      float leftD=paintDistance(paintDepth(vUv-vec2(px.x,0)));
      float rightD=paintDistance(paintDepth(vUv+vec2(px.x,0)));
      float bottomD=paintDistance(paintDepth(vUv-vec2(0,px.y)));
      float topD=paintDistance(paintDepth(vUv+vec2(0,px.y)));
      vec2 backSlope=vec2(distance-leftD,distance-bottomD);
      vec2 forwardSlope=vec2(rightD-distance,topD-distance);
      // The shorter one-sided slope avoids extrapolating background depth
      // through a car silhouette, but allows samples along an oblique floor.
      vec2 depthSlope=vec2(abs(backSlope.x)<abs(forwardSlope.x)?backSlope.x:forwardSlope.x,
        abs(backSlope.y)<abs(forwardSlope.y)?backSlope.y:forwardSlope.y);
      // Thin wires can have background on both sides. Opposite one-sided
      // slopes are a discontinuity, not a plane to extrapolate through.
      depthSlope*=step(vec2(0.),backSlope*forwardSlope);
      vec3 paintMass=paintSectors(source.rgb,distance,depthSlope,paintTangent,anisotropy,detailGuard,px);
      float blend=painterStrength*mix(.58,.92,referenceStyleStrength)
        *(1.-detailGuard*mix(.88,.72,referenceStyleStrength));
      c=mix(c,paintMass,blend);
      grouped=mix(grouped,paintMass,painterStrength);
    }

    vec3 referenceSource=c;
    // Palette direction from the garage painting: charcoal/navy recesses,
    // aubergine mid-shadows, restrained rust, cream and amber highlights.
    // Preserve local hue and fine contrast; this is not a replacement palette.
    float shadow=1.-smoothstep(.10,.43,light);
    float middle=smoothstep(.10,.32,light)*(1.-smoothstep(.52,.78,light));
    vec3 coolPigment=vec3(.069,.075,.115);
    c=mix(c, c*.72+coolPigment*.5, shadow*.72);
    c += vec3(.017,-.004,.014)*middle;
    float warm=smoothstep(.50,.90,light);
    c=mix(c,c*vec3(1.055,1.014,.92),warm*.62);
    float chroma=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));
    c=mix(vec3(paintLuma(c)),c,1.10-chroma*.12);

    // Smooth-to-stepped pigment values, many levels. Retain the high-frequency
    // source residual instead of posterizing away the authored texture.
    float mass=paintLuma(grouped);
    float level=mass*23.;
    float stepped=(floor(level)+smoothstep(.29,.71,fract(level)))/23.;
    c += vec3((stepped-mass)*.42);
    // The selected pigments are measured from the supplied garage artwork.
    // A coherent painted mass chooses the family while source detail survives.
    c=mix(c,cutscenePaletteColor(referenceSource,grouped,1.),referenceStyleStrength);

    // Projection-correct depth curvature picks geometric overlap/creases.
    // Reject the first derivative so a flat oblique floor is never inked.
    float dl=paintDepth(vUv-vec2(px.x,0)),dr=paintDepth(vUv+vec2(px.x,0));
    float db=paintDepth(vUv-vec2(0,px.y)),dt=paintDepth(vUv+vec2(0,px.y));
    float meters=mix(cameraFar-cameraNear,
      distance*distance*(cameraFar-cameraNear)/max(cameraNear*cameraFar,.000001),cameraPerspective);
    float bend=max(abs(dl+dr-2.*d),abs(db+dt-2.*d))*meters;
    float contour=smoothstep(.015+distance*.001,.045+distance*.003,bend)*surface;
    // Beauty depth describes opaque seats behind transparent windows. A
    // separately depth-tested glass mask keeps those overlaps from receiving
    // the same drawn contour as an exposed body seam or silhouette.
    float glazingInk=1.;
    if(glazingMaskEnabled>0.) glazingInk=1.-texture2D(glazingMask,vUv).r*.90;
    contour*=glazingInk;
    // Atmospheric terrain keeps its painted value structure. A near-object
    // ink weight at a hundred metres would trace individual terrain facets.
    float inkDistance=1.-smoothstep(28.,85.,distance);
    float lineLight=1.-smoothstep(.52,.88,light);
    float neighborLight=max(max(paintLuma(l),paintLuma(r)),max(paintLuma(b),paintLuma(t)));
    float selectedLine=(mix(.36,.60,referenceStyleStrength)+mix(.64,.40,referenceStyleStrength)*smoothstep(.035,.19,length(grad)))
      *(1.-smoothstep(.46,.82,neighborLight)*.66);
    vec3 ink=vec3(.045,.040,.060);
    c=mix(c,min(c,ink),contour*lineLight*selectedLine*mix(.68,.94,referenceStyleStrength)*inkDistance);

    // A small number of drawn interior details survive independently of the
    // silhouette. Bright-facing edges receive a broken warm glint, not a halo.
    float valley=max(0.,paintLuma((l+r+b+t)*.25)-light);
    float fineInk=smoothstep(.038,.13,valley)*(1.-smoothstep(.45,.75,light));
    fineInk*=glazingInk;
    c=mix(c,min(c,ink),fineInk*mix(.28,.43,referenceStyleStrength)*surface*inkDistance);
    float ridge=max(0.,light-paintLuma((l+r+b+t)*.25));
    float glint=smoothstep(.04,.19,ridge)*smoothstep(.45,.88,light);
    vec3 glintPaint=mix(source.rgb,vec3(1.,.90,.70),.16);
    c=mix(c,glintPaint,glint*mix(.24,.42,referenceStyleStrength)*surface*(1.-smoothstep(.90,.99,light)));

    gl_FragColor=vec4(mix(source.rgb,clamp(c,0.,1.),finishStrength),source.a);
  }
`;
