import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Image-derived compact colour regions. Inspired by SLIC's local colour +
 * position assignment, not a full SLIC implementation (no connectivity sweep).
 * No authored marks, palette texture, random noise or material-name knowledge.
 * Beauty is already tone-mapped sRGB; depth remains the original 3D depth. */
const vertex = `precision highp float;in vec3 position;in vec2 uv;out vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const common = `precision highp float;precision highp int;precision highp sampler2D;
in vec2 vUv;
uniform sampler2D sourceColor,sceneDepth,centerColor,centerData,centerMass,centerBounds,assignments,previousAssignments,mergeChoices,structureField,fineTone;
uniform vec2 resolution,gridSize;
uniform float spacing,compactness,colorScale,cameraNear,cameraFar,cameraPerspective,paletteSteps,mergeColorScale,directionStrength,mergeScale,neighborStrength,hasPreviousLabels,labelPhase;
vec2 bound(vec2 p){return clamp(p,vec2(.5),resolution-.5);}
vec3 readColor(vec2 p){return texture(sourceColor,bound(p)/resolution).rgb;}
float readDepth(vec2 p){float d=texture(sceneDepth,bound(p)/resolution).r;
 return mix(mix(cameraNear,cameraFar,d),cameraNear*cameraFar/max(cameraFar-d*(cameraFar-cameraNear),.00001),cameraPerspective);}
vec2 depthSlope(vec2 p,float z){vec2 back=vec2(z-readDepth(p-vec2(1,0)),z-readDepth(p-vec2(0,1)));
 vec2 forward=vec2(readDepth(p+vec2(1,0))-z,readDepth(p+vec2(0,1))-z);
 return vec2(abs(back.x)<abs(forward.x)?back.x:forward.x,abs(back.y)<abs(forward.y)?back.y:forward.y)*step(vec2(0),back*forward);}
vec3 perceptual(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),(c.r-c.b)*.5,(-c.r+2.*c.g-c.b)*.25);}
vec3 clusterPigment(vec3 c,float z){
 // Unbounded sky has no geometric plane to segment. It still receives shared
 // pixel regions, but avoid drawing contour-map bands in its smooth radiance.
 if(paletteSteps<1.||z>cameraFar*.99)return c;
 vec3 p=perceptual(c);
 // Stable perceptual lattice shared by all regions and all frames. Quantize
 // region representatives, then feed them back into pixel assignment.
 // More shadow levels preserve dark mechanical detail without dithering.
 float value=sqrt(max(0.,p.x));value=floor(value*paletteSteps+.5)/paletteSteps;
 p.x=value*value;p.yz=floor(p.yz*paletteSteps*1.5+.5)/(paletteSteps*1.5);
 return clamp(vec3(p.x+p.y-p.z,p.x+p.z,p.x-p.y-p.z),0.,1.);
}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 centerUv(vec2 id){return (clamp(id,vec2(0),gridSize-1.)+.5)/gridSize;}
float spatialDistance(vec2 delta,vec4 flow){
 float stretch=1.+directionStrength*flow.z*2.;
 vec2 axis=vec2(dot(delta,flow.xy),dot(delta,vec2(-flow.y,flow.x)));
 return axis.x*axis.x/stretch+axis.y*axis.y*stretch;
}
vec4 regionFlow(vec2 uv){
 if(mergeScale<=1.)return texture(structureField,uv);
 vec4 mass=texture(centerMass,uv);vec2 q=mass.gb/max(mass.r,1.);
 float confidence=clamp(length(q),0.,1.);
 float angle=confidence>.000001?.5*atan(q.y,q.x):0.;
 return vec4(cos(angle),sin(angle),confidence,0.);
}
`;
// A smoothed color structure tensor measures the local tangent and confidence.
// It is regenerated from the actual lit frame, once per fixed seed cell. No
// stroke atlas or random orientation is involved. Depth rejects other planes.
const structure = `${common}
layout(location=0) out vec4 result;
void main(){
 vec2 id=floor(vUv*gridSize),p=bound(floor((id+.5)*spacing)+.5);
 float z=readDepth(p);vec2 slope=depthSlope(p,z);vec3 tensor=vec3(0);float total=0.;
 float stepSize=max(1.,spacing*.5);
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
  vec2 offset=vec2(x,y)*stepSize,q=p+offset;
  float weight=exp(-float(x*x+y*y)*.5);
  float tolerance=.035+z*.003;
  if(abs(readDepth(q)-z-dot(offset,slope))>tolerance)continue;
  // Reject derivative taps on another surface too. Testing only q would
  // still let a foreground edge borrow a background color direction.
  if(abs(readDepth(q+vec2(1,0))-z-dot(offset+vec2(1,0),slope))>tolerance||
     abs(readDepth(q-vec2(1,0))-z-dot(offset-vec2(1,0),slope))>tolerance||
     abs(readDepth(q+vec2(0,1))-z-dot(offset+vec2(0,1),slope))>tolerance||
     abs(readDepth(q-vec2(0,1))-z-dot(offset-vec2(0,1),slope))>tolerance)continue;
  vec3 dx=(perceptual(readColor(q+vec2(1,0)))-perceptual(readColor(q-vec2(1,0))))*.5;
  vec3 dy=(perceptual(readColor(q+vec2(0,1)))-perceptual(readColor(q-vec2(0,1))))*.5;
  tensor+=vec3(dot(dx,dx),dot(dy,dy),dot(dx,dy))*weight;total+=weight;
 }
 tensor/=max(total,.0001);
 float energy=tensor.x+tensor.y;
 float difference=length(vec2(tensor.x-tensor.y,2.*tensor.z));
 float angle=difference>.0000001?.5*atan(2.*tensor.z,tensor.x-tensor.y)+1.57079632679:0.;
 vec2 tangent=vec2(cos(angle),sin(angle));
 float coherence=clamp(difference/max(energy,.000001),0.,1.);
 coherence*=smoothstep(.000002,.00004,energy);
 result=vec4(tangent,coherence,energy);
}`;
const init = `${common}
layout(location=0) out vec4 colorOut;layout(location=1) out vec4 dataOut;
layout(location=2) out vec4 massOut;layout(location=3) out vec4 boundsOut;
void main(){vec2 id=floor(vUv*gridSize),p=bound(floor((id+.5)*spacing)+.5);
 float z=readDepth(p);colorOut=vec4(clusterPigment(readColor(p),z),z);dataOut=vec4(p,depthSlope(p,z));
 massOut=vec4(1.,0.,0.,1.);boundsOut=vec4(p,p);}`;
const assign = `${common}
layout(location=0) out vec4 result;
void main(){vec2 p=floor(vUv*resolution)+.5,base=floor(p/spacing);
 vec3 c=readColor(p),pc=perceptual(c);float z=readDepth(p),best=1.e20;vec2 winner=base;
 bool regularize=neighborStrength>0.&&hasPreviousLabels>.5;
 vec2 previous=regularize?texture(previousAssignments,p/resolution).rg:base;
 // Red/black updates keep the four neighbors fixed during each phase.
 // This avoids synchronous label swaps while retaining bounded local work.
 if(regularize&&labelPhase>=0.&&mod(floor(p.x)+floor(p.y),2.)!=labelPhase){
  result=texture(previousAssignments,p/resolution);return;
 }
 vec2 neighbors[4];float weights[4];
 if(regularize){
  vec2 slope=depthSlope(p,z);
  for(int k=0;k<4;k++){
   vec2 stepTo=k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1),q=p+stepTo;
   weights[k]=0.;neighbors[k]=vec2(-1);
   if(any(lessThan(q,vec2(.5)))||any(greaterThan(q,resolution-.5)))continue;
   float qz=readDepth(q),tolerance=.035+min(z,qz)*.003;
   if(abs(qz-z-dot(stepTo,slope))>tolerance||abs(z-qz+dot(stepTo,depthSlope(q,qz)))>tolerance)continue;
   vec3 difference=pc-perceptual(readColor(q));
   weights[k]=exp(-dot(difference,difference)/.0128);
   neighbors[k]=texture(previousAssignments,q/resolution).rg;
  }
 }
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 id=base+vec2(x,y);if(any(lessThan(id,vec2(0)))||any(greaterThanEqual(id,gridSize)))continue;
  vec2 uv=centerUv(id);vec4 cc=texture(centerColor,uv),cd=texture(centerData,uv);
  vec2 delta=p-cd.xy;vec3 diff=(pc-perceptual(cc.rgb))/colorScale;
  float dz=abs(z-cc.a-dot(delta,cd.zw));float tolerance=.035+z*.003;
  float depthCost=min(32.,dz/tolerance);
  // A thin seam can separate identical endpoint colours. Penalise crossing
  // its midpoint, while allowing ordinary gradients to remain one region.
  vec3 mid=perceptual(readColor((p+cd.xy)*.5));
  vec3 low=min(pc,perceptual(cc.rgb)),high=max(pc,perceptual(cc.rgb));
  vec3 excursion=max(low-mid,vec3(0))+max(mid-high,vec3(0));
  float barrier=dot(excursion,excursion)/(colorScale*colorScale);
  vec4 flow=texture(structureField,uv);
  float spatial=directionStrength>0.?spatialDistance(delta,flow):dot(delta,delta);
  float cost=dot(diff,diff)+spatial*compactness/(spacing*spacing)+depthCost*depthCost+barrier*2.;
  if(regularize)for(int k=0;k<4;k++){
   if(any(greaterThan(abs(neighbors[k]-id),vec2(.1))))cost+=neighborStrength*weights[k];
  }
  bool retain=regularize&&all(lessThan(abs(id-previous),vec2(.1)));
  if(cost<best||(cost==best&&retain)){best=cost;winner=id;}
 }
 result=vec4(winner,best,1.);
}`;
const update = `${common}
layout(location=0) out vec4 colorOut;layout(location=1) out vec4 dataOut;
layout(location=2) out vec4 massOut;layout(location=3) out vec4 boundsOut;
void main(){vec2 id=floor(vUv*gridSize),origin=(id+.5)*spacing;
 vec3 sum=vec3(0);vec2 positionSum=vec2(0),directionSum=vec2(0);float count=0.;
 vec2 lower=resolution,upper=vec2(0);
 vec2 member=origin;float memberDistance=1.e20;
 // Candidate search uses3x3 fixed seed cells. Gather covers those cells;
 // the source-member fallback does not change this assignment neighborhood.
 for(int y=-9;y<=9;y++)for(int x=-9;x<=9;x++){
  vec2 offset=vec2(x,y);if(any(greaterThan(abs(offset),vec2(spacing*1.5))))continue;
  vec2 p=floor(origin)+offset+.5;
  if(any(lessThan(p,vec2(.5)))||any(greaterThan(p,resolution-.5)))continue;
  vec2 label=texture(assignments,p/resolution).rg;
  if(any(greaterThan(abs(label-id),vec2(.1))))continue;
  sum+=readColor(p);positionSum+=p;count+=1.;
  if(mergeScale>1.&&directionStrength>0.){
   vec4 flow=texture(structureField,centerUv(floor(p/spacing)));
   // Axial moments are sign invariant: a tangent and its opposite agree.
   directionSum+=flow.z*vec2(flow.x*flow.x-flow.y*flow.y,2.*flow.x*flow.y);
  }
  lower=min(lower,p);upper=max(upper,p);
  float d=dot(p-origin,p-origin);if(d<memberDistance){memberDistance=d;member=p;}
 }
 massOut=vec4(count,directionSum,1.);boundsOut=vec4(lower,upper);
 if(count<.5){colorOut=texture(centerColor,centerUv(id));dataOut=texture(centerData,centerUv(id));return;}
 vec2 p=bound(floor(clamp(positionSum/count,origin-spacing*.5,origin+spacing*.5))+.5);
 // A centroid can fall in a hole of its own region. Its depth must belong to
 // a real assigned pixel, not a background surface between two thin parts.
 vec2 label=texture(assignments,p/resolution).rg;
 if(any(greaterThan(abs(label-id),vec2(.1))))p=member;
 float z=readDepth(p);colorOut=vec4(clusterPigment(sum/count,z),z);dataOut=vec4(p,depthSlope(p,z));
}`;
// Merge only regions that share a real cardinal pixel boundary. Mutual choices
// form disjoint pairs, so each merge has one exact area-weighted representative.
// A larger optional hierarchy permits broad regions without a global palette.
const chooseMerge = `${common}
layout(location=0) out vec4 result;
uint edgePriority(vec2 a,vec2 b){
 uint ai=uint(a.y*gridSize.x+a.x),bi=uint(b.y*gridSize.x+b.x);
 uint v=min(ai,bi)*1664525u+max(ai,bi)*1013904223u;
 v^=v>>16;v*=2246822519u;v^=v>>13;
 return v;
}
void main(){
 vec2 id=floor(vUv*gridSize),uv=centerUv(id);vec4 a=texture(centerColor,uv),ad=texture(centerData,uv),ab=texture(centerBounds,uv);
 float area=texture(centerMass,uv).r,best=1.e20;vec2 winner=id;
 float maxExtent=spacing*3.*mergeScale,maxArea=spacing*spacing*4.*mergeScale*mergeScale;
 uint bestPriority=0xffffffffu;
 vec4 aflow=regionFlow(uv);
 if(area<.5||any(greaterThan(ab.zw-ab.xy+1.,vec2(maxExtent)))){result=vec4(id,best,0.);return;}
 for(int y=0;y<36;y++){
  if(ab.y+float(y)>ab.w)break;
  for(int x=0;x<36;x++){
  if(ab.x+float(x)>ab.z)break;
  vec2 p=ab.xy+vec2(x,y);
  if(any(greaterThan(abs(texture(assignments,p/resolution).rg-id),vec2(.1))))continue;
  for(int k=0;k<4;k++){
   vec2 stepTo=k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
   vec2 q=p+stepTo;if(any(lessThan(q,vec2(.5)))||any(greaterThan(q,resolution-.5)))continue;
   vec2 other=texture(assignments,q/resolution).rg;if(all(lessThan(abs(other-id),vec2(.1))))continue;
   vec2 buv=centerUv(other);float barea=texture(centerMass,buv).r;
   if(barea<.5||area+barea>maxArea)continue;
   vec4 bb=texture(centerBounds,buv);if(any(greaterThan(max(ab.zw,bb.zw)-min(ab.xy,bb.xy)+1.,vec2(maxExtent))))continue;
   vec4 b=texture(centerColor,buv),bd=texture(centerData,buv);vec2 delta=bd.xy-ad.xy;
   float tolerance=.035+min(a.a,b.a)*.003;
   if(abs(b.a-a.a-dot(delta,ad.zw))>tolerance||abs(a.a-b.a+dot(delta,bd.zw))>tolerance)continue;
   vec3 difference=(perceptual(a.rgb)-perceptual(b.rgb))/mergeColorScale;
   float colorCost=dot(difference,difference);if(colorCost>1.)continue;
   vec3 edge=perceptual(readColor(p))-perceptual(readColor(q));if(dot(edge,edge)>.0256)continue;
   // Prefer a continuation along the measured image tangent. Keep both
   // regions' confidence so junctions do not inherit one arbitrary direction.
   float cost=colorCost+dot(delta,delta)*.0001;
   if(directionStrength>0.){
    vec4 bflow=regionFlow(buv);
    float directional=(spatialDistance(delta,aflow)+spatialDistance(delta,bflow))*.5;
    cost+=directionStrength*min(aflow.z,bflow.z)*directional*.08/(spacing*spacing);
   }
   // Shared edge priority only breaks equal-cost ties. It changes neither
   // colors nor shapes directly, and avoids a lowest-ID merge wavefront.
   uint priority=edgePriority(id,other);
   bool tie=mergeScale>1.?priority<bestPriority:other.y*gridSize.x+other.x<winner.y*gridSize.x+winner.x;
   if(cost<best||(cost==best&&tie)){best=cost;winner=other;bestPriority=priority;}
  }
  }
 }
 // A larger pair must be compatible along every shared contact. One weak
 // contact must not let it cross a strong seam elsewhere on the boundary.
 if(mergeScale>1.&&any(greaterThan(abs(winner-id),vec2(.1)))){
  bool safe=true;
  for(int y=0;y<36;y++){
   if(!safe||ab.y+float(y)>ab.w)break;
   for(int x=0;x<36;x++){
    if(!safe||ab.x+float(x)>ab.z)break;
    vec2 p=ab.xy+vec2(x,y);
    if(any(greaterThan(abs(texture(assignments,p/resolution).rg-id),vec2(.1))))continue;
    for(int k=0;k<4;k++){
     vec2 stepTo=k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
     vec2 q=p+stepTo;if(any(lessThan(q,vec2(.5)))||any(greaterThan(q,resolution-.5)))continue;
     if(any(greaterThan(abs(texture(assignments,q/resolution).rg-winner),vec2(.1))))continue;
     float pz=readDepth(p),qz=readDepth(q),tolerance=.035+min(pz,qz)*.003;
     vec3 edge=perceptual(readColor(p))-perceptual(readColor(q));
     if(dot(edge,edge)>.0256||abs(qz-pz-dot(stepTo,depthSlope(p,pz)))>tolerance
       ||abs(pz-qz+dot(stepTo,depthSlope(q,qz)))>tolerance){safe=false;break;}
    }
   }
  }
  if(!safe)winner=id;
 }
 result=vec4(winner,best,1.);
}`;
const mergePair = `${common}
vec2 mergedOwner(vec2 id){vec2 partner=texture(mergeChoices,centerUv(id)).rg;
 vec2 back=texture(mergeChoices,centerUv(partner)).rg;
 if(any(greaterThan(abs(back-id),vec2(.1))))return id;
 return partner.y*gridSize.x+partner.x<id.y*gridSize.x+id.x?partner:id;}
`;
const mergeCenters = `${mergePair}
layout(location=0) out vec4 colorOut;layout(location=1) out vec4 dataOut;
layout(location=2) out vec4 massOut;layout(location=3) out vec4 boundsOut;
void main(){vec2 id=floor(vUv*gridSize),uv=centerUv(id);
 colorOut=texture(centerColor,uv);dataOut=texture(centerData,uv);massOut=texture(centerMass,uv);boundsOut=texture(centerBounds,uv);
 vec2 owner=mergedOwner(id);if(any(greaterThan(abs(owner-id),vec2(.1)))){massOut.r=0.;return;}
 vec2 partner=texture(mergeChoices,uv).rg;if(all(lessThan(abs(partner-id),vec2(.1))))return;
 if(any(greaterThan(abs(mergedOwner(partner)-id),vec2(.1))))return;
 vec2 puv=centerUv(partner);float otherMass=texture(centerMass,puv).r,total=massOut.r+otherMass;
 if(total<.5)return;
 colorOut.rgb=(colorOut.rgb*massOut.r+texture(centerColor,puv).rgb*otherMass)/total;
 massOut.gb+=texture(centerMass,puv).gb;
 massOut.r=total;vec4 otherBounds=texture(centerBounds,puv);boundsOut=vec4(min(boundsOut.xy,otherBounds.xy),max(boundsOut.zw,otherBounds.zw));
}`;
const mergeLabels = `${mergePair}
layout(location=0) out vec4 result;
void main(){vec2 id=texture(assignments,vUv).rg;result=vec4(mergedOwner(id),0.,1.);}`;
// Keep the smaller, genuinely assigned color regions before the adjacency
// hierarchy combines them. One R16F luminance image is enough: broad regions
// still own hue, while the fine regions retain the light shapes already
// present in the physically shaded 3D source.
const captureFineTone = `${common}
layout(location=0) out vec4 result;
void main(){vec2 p=floor(vUv*resolution)+.5;
 vec2 id=texture(assignments,p/resolution).rg;
 result=vec4(luma(texture(centerColor,centerUv(id)).rgb),0.,0.,1.);
}`;
// An opt-in local value preconditioner runs BEFORE labels and region means are
// computed. It uses only the already shaded scene and original scene depth:
// nearby samples on another 3D plane cannot make a halo around a silhouette.
// The current composer supplies tone-mapped display RGB, not linear HDR.
const preRegionContrast = `${common}
uniform float preRegionContrastStrength;
layout(location=0) out vec4 result;
void main(){
 vec2 p=floor(vUv*resolution)+.5;
 vec3 color=readColor(p);
 float z=readDepth(p),value=luma(color);
 if(z>=cameraFar*.98||value<.008){result=vec4(color,1.);return;}
 vec2 slope=depthSlope(p,z);
 float centre=log2(value+.025),sum=0.,weightSum=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  if(x==0&&y==0)continue;
  vec2 offset=vec2(x,y)*6.,q=p+offset;
  float qz=readDepth(q),tolerance=.035+z*.003;
  float planeError=abs(qz-z-dot(offset,slope));
  if(planeError>tolerance)continue;
  float other=log2(luma(readColor(q))+.025);
  // Strong material/color discontinuities are not a local illumination trend.
  float weight=exp(-abs(other-centre)*2.)*exp(-float(x*x+y*y)*.25);
  sum+=other*weight;weightSum+=weight;
 }
 if(weightSum<.001){result=vec4(color,1.);return;}
 float deviation=clamp(centre-sum/weightSum,-.55,.55);
 // Multiplicative value contrast retains the source hue and preserves a flat
 // surface exactly. The floor and cap limit amplification of near-black noise.
 float gain=exp2(deviation*preRegionContrastStrength);
 result=vec4(clamp(color*gain,0.,1.),1.);
}`;
const compose = `${common}
uniform float pixelSize,strength,detailStrength,debugLabels,fineToneStrength,fineToneContrast,edgeInkStrength,curvatureInkStrength;
layout(location=0) out vec4 result;
void main(){
 vec2 native=floor(vUv*resolution)+.5;
 vec2 p=bound(floor(floor(native/pixelSize)*pixelSize+pixelSize*.5)+.5);
 vec2 id=texture(assignments,p/resolution).rg;
 vec3 grouped=texture(centerColor,centerUv(id)).rgb;
 if(fineToneStrength>0.){
  float broadValue=luma(grouped),smallValue=texture(fineTone,p/resolution).r;
  // A bounded log-value residual preserves small reflected-light planes even
  // in dark paint. It changes neither the macro region labels nor their hue.
  // The .025 floor prevents a near-black region from amplifying quantization.
  float lightStops=clamp(log2((smallValue+.025)/(broadValue+.025)),-.6,.6);
  grouped*=exp2(lightStops*fineToneStrength*fineToneContrast);
 }
 vec3 source=readColor(p);float c=luma(source);
 float left=luma(readColor(p-vec2(pixelSize,0))),right=luma(readColor(p+vec2(pixelSize,0)));
 float bottom=luma(readColor(p-vec2(0,pixelSize))),top=luma(readColor(p+vec2(0,pixelSize)));
 // Only narrow local extrema get a detail escape. A single ordinary edge
 // does not qualify, so silhouettes remain clustered stair-step contours.
 float thin=max(min(c-left,c-right),min(left-c,right-c));
 thin=max(thin,max(min(c-bottom,c-top),min(bottom-c,top-c)));
 float detail=smoothstep(.065,.18,thin)*detailStrength;
 vec3 colored=mix(grouped,source,detail);
 if(edgeInkStrength>0.){
  // A nearer-side one-pixel contour comes from true scene depth after region
  // composition, so the hierarchy cannot average it away. The local depth
  // slope cancels continuous perspective planes such as asphalt and walls.
  float z=readDepth(p),contour=0.;
  if(z<cameraFar*.98){
   vec2 slope=depthSlope(p,z);
   for(int k=0;k<4;k++){
    vec2 stepTo=k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
    float gap=readDepth(p+stepTo)-z-dot(stepTo,slope);
    contour=max(contour,smoothstep(.025+z*.0015,.08+z*.003,gap));
   }
   contour*=1.-smoothstep(35.,100.,z);
  }
  colored=mix(colored,min(colored,vec3(.013,.011,.021)),contour*edgeInkStrength);
 }
 if(curvatureInkStrength>0.){
  // Hardware depth is affine across a projected 3D plane. Its signed second
  // difference therefore isolates concave geometric folds without treating
  // the receding road or a smooth wall as a contour. No color/texture edge is
  // allowed to create a mark here.
  float d=texture(sceneDepth,p/resolution).r;
  if(d<.999999){
   float z=readDepth(p),sampleStep=max(1.,pixelSize);
   vec2 dx=vec2(sampleStep,0.),dy=vec2(0.,sampleStep);
   float dl=texture(sceneDepth,bound(p-dx)/resolution).r;
   float dr=texture(sceneDepth,bound(p+dx)/resolution).r;
   float db=texture(sceneDepth,bound(p-dy)/resolution).r;
   float dt=texture(sceneDepth,bound(p+dy)/resolution).r;
   // Reject silhouettes and detached overlapping geometry before classifying
   // a fold. The depth-buffer derivative converts neighbor gaps to metres.
   float metresPerDepth=mix(cameraFar-cameraNear,
    z*z*(cameraFar-cameraNear)/max(cameraNear*cameraFar,.00001),cameraPerspective);
   float maxGap=.028+z*.0025;
   float validX=1.-step(maxGap,max(abs(dl-d),abs(dr-d))*metresPerDepth);
   float validY=1.-step(maxGap,max(abs(db-d),abs(dt-d))*metresPerDepth);
   validX*=step(dl,.999999)*step(dr,.999999);
   validY*=step(db,.999999)*step(dt,.999999);
   // A concave valley is farther than its two flanks after removing the
   // affine plane component. Convex roofs may keep their physical light catch.
   float relativeScale=metresPerDepth/max(z,1.);
   float bend=max(validX*max(0.,2.*d-dl-dr),validY*max(0.,2.*d-db-dt))*relativeScale;
   float fold=smoothstep(.00045,.0032,bend)*(1.-smoothstep(35.,100.,z));
   colored=mix(colored,min(colored,vec3(.013,.011,.021)),fold*curvatureInkStrength);
  }
 }
 if(debugLabels>.5)colored=fract(vec3(id.x*.173+id.y*.071,id.x*.037+id.y*.139,id.x*.097+id.y*.053));
 result=vec4(mix(readColor(native),colored,strength),1.);
}`;

export class PixelClusterPass extends Pass {
  private uniforms: Record<string, THREE.IUniform>;
  private quad = new FullScreenQuad();
  private initMaterial: THREE.RawShaderMaterial;
  private structureMaterial: THREE.RawShaderMaterial;
  private assignMaterial: THREE.RawShaderMaterial;
  private updateMaterial: THREE.RawShaderMaterial;
  private composeMaterial: THREE.RawShaderMaterial;
  private fineToneMaterial: THREE.RawShaderMaterial;
  private preRegionContrastMaterial: THREE.RawShaderMaterial;
  private chooseMergeMaterial: THREE.RawShaderMaterial;
  private mergeCentersMaterial: THREE.RawShaderMaterial;
  private mergeLabelsMaterial: THREE.RawShaderMaterial;
  private centers: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private labels: THREE.WebGLRenderTarget;
  private mergedLabels: THREE.WebGLRenderTarget;
  private choices: THREE.WebGLRenderTarget;
  private structure: THREE.WebGLRenderTarget;
  private fineToneTarget: THREE.WebGLRenderTarget;
  private preRegionContrastTarget: THREE.WebGLRenderTarget;
  private width=1; private height=1;
  private iterations=2;
  private mergeRounds=0;
  constructor() {
    super();this.enabled=false;
    this.uniforms={sourceColor:{value:null},sceneDepth:{value:null},centerColor:{value:null},centerData:{value:null},centerMass:{value:null},centerBounds:{value:null},assignments:{value:null},previousAssignments:{value:null},neighborStrength:{value:0},hasPreviousLabels:{value:0},labelPhase:{value:-1},mergeChoices:{value:null},mergeColorScale:{value:.055},mergeScale:{value:1},structureField:{value:null},directionStrength:{value:0},fineTone:{value:null},fineToneStrength:{value:0},fineToneContrast:{value:1},edgeInkStrength:{value:0},curvatureInkStrength:{value:0},preRegionContrastStrength:{value:0},
      resolution:{value:new THREE.Vector2(1,1)},gridSize:{value:new THREE.Vector2(1,1)},spacing:{value:4},compactness:{value:.3},colorScale:{value:.055},
      cameraNear:{value:.08},cameraFar:{value:300},cameraPerspective:{value:1},pixelSize:{value:2},strength:{value:1},detailStrength:{value:1},debugLabels:{value:0},paletteSteps:{value:0}};
    const material=(fragmentShader:string)=>new THREE.RawShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader,
      glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.NoBlending});
    this.initMaterial=material(init);this.assignMaterial=material(assign);this.updateMaterial=material(update);this.composeMaterial=material(compose);
    this.fineToneMaterial=material(captureFineTone);
    this.preRegionContrastMaterial=material(preRegionContrast);
    this.structureMaterial=material(structure);
    this.chooseMergeMaterial=material(chooseMerge);this.mergeCentersMaterial=material(mergeCenters);this.mergeLabelsMaterial=material(mergeLabels);
    const target=(count=1)=>new THREE.WebGLRenderTarget(1,1,{count,type:THREE.FloatType,format:THREE.RGBAFormat,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
    this.centers=[target(4),target(4)];this.labels=target();this.mergedLabels=target();this.choices=target();this.structure=target();
    this.fineToneTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RedFormat,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
    this.preRegionContrastTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
    this.uniforms.fineTone!.value=this.fineToneTarget.texture;
  }
  configure(options:{spacing?:number;compactness?:number;colorScale?:number;iterations?:number;pixelSize?:number;strength?:number;detailStrength?:number;debugLabels?:boolean;paletteSteps?:number;mergeRounds?:number;mergeColorScale?:number;directionStrength?:number;mergeScale?:number;neighborStrength?:number;fineToneStrength?:number;fineToneContrast?:number;edgeInkStrength?:number;curvatureInkStrength?:number;preRegionContrastStrength?:number}) {
    for(const key of ['compactness','colorScale','pixelSize','strength','detailStrength','mergeColorScale','directionStrength','fineToneStrength','edgeInkStrength','curvatureInkStrength'] as const){const value=options[key];if(value!==undefined&&Number.isFinite(value)){
      const bounds=key==='colorScale'||key==='mergeColorScale'?[.005,.3]:key==='pixelSize'?[1,4]:key==='compactness'?[.01,4]:[0,1];
      this.uniforms[key]!.value=THREE.MathUtils.clamp(value,bounds[0]!,bounds[1]!);
    }}
    if(options.iterations!==undefined&&Number.isFinite(options.iterations))this.iterations=THREE.MathUtils.clamp(Math.round(options.iterations),1,4);
    if(options.mergeRounds!==undefined&&Number.isFinite(options.mergeRounds))this.mergeRounds=THREE.MathUtils.clamp(Math.round(options.mergeRounds),0,6);
    if(options.mergeScale!==undefined&&Number.isFinite(options.mergeScale))this.uniforms.mergeScale!.value=THREE.MathUtils.clamp(options.mergeScale,1,2);
    if(options.neighborStrength!==undefined&&Number.isFinite(options.neighborStrength))this.uniforms.neighborStrength!.value=THREE.MathUtils.clamp(options.neighborStrength,0,4);
    if(options.fineToneContrast!==undefined&&Number.isFinite(options.fineToneContrast))this.uniforms.fineToneContrast!.value=THREE.MathUtils.clamp(options.fineToneContrast,0,3);
    if(options.preRegionContrastStrength!==undefined&&Number.isFinite(options.preRegionContrastStrength))this.uniforms.preRegionContrastStrength!.value=THREE.MathUtils.clamp(options.preRegionContrastStrength,0,3);
    if(options.debugLabels!==undefined)this.uniforms.debugLabels!.value=options.debugLabels?1:0;
    if(options.paletteSteps!==undefined&&Number.isFinite(options.paletteSteps))this.uniforms.paletteSteps!.value=options.paletteSteps<1?0:THREE.MathUtils.clamp(options.paletteSteps,8,64);
    if(options.spacing!==undefined&&Number.isFinite(options.spacing)){this.uniforms.spacing!.value=THREE.MathUtils.clamp(Math.round(options.spacing),2,6);this.setSize(this.width,this.height);}
  }
  setDepth(texture:THREE.Texture,camera:THREE.Camera) {
    this.uniforms.sceneDepth!.value=texture;const c=camera as THREE.PerspectiveCamera;
    this.uniforms.cameraNear!.value=c.near;this.uniforms.cameraFar!.value=c.far;this.uniforms.cameraPerspective!.value=c.projectionMatrix.elements[11]===-1?1:0;
  }
  setSize(width:number,height:number) {
    this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height));
    const w=Math.ceil(this.width/this.uniforms.spacing!.value),h=Math.ceil(this.height/this.uniforms.spacing!.value);
    this.uniforms.resolution!.value.set(this.width,this.height);this.uniforms.gridSize!.value.set(w,h);
    this.centers.forEach(t=>t.setSize(w,h));this.choices.setSize(w,h);this.structure.setSize(w,h);this.labels.setSize(this.width,this.height);this.mergedLabels.setSize(this.width,this.height);
    this.fineToneTarget.setSize(this.width,this.height);
    this.preRegionContrastTarget.setSize(this.width,this.height);
  }
  stats(){return {enabled:this.enabled,width:this.width,height:this.height,spacing:this.uniforms.spacing!.value,iterations:this.iterations,
    compactness:this.uniforms.compactness!.value,colorScale:this.uniforms.colorScale!.value,pixelSize:this.uniforms.pixelSize!.value,
    detailStrength:this.uniforms.detailStrength!.value,strength:this.uniforms.strength!.value,paletteSteps:this.uniforms.paletteSteps!.value,
    mergeRounds:this.mergeRounds,mergeScale:this.uniforms.mergeScale!.value,neighborStrength:this.uniforms.neighborStrength!.value,mergeColorScale:this.uniforms.mergeColorScale!.value,directionStrength:this.uniforms.directionStrength!.value,fineToneStrength:this.uniforms.fineToneStrength!.value,fineToneContrast:this.uniforms.fineToneContrast!.value,edgeInkStrength:this.uniforms.edgeInkStrength!.value,curvatureInkStrength:this.uniforms.curvatureInkStrength!.value,preRegionContrastStrength:this.uniforms.preRegionContrastStrength!.value,method:'image-derived color-depth regions with structure-tensor direction'};}
  render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer:THREE.WebGLRenderTarget) {
    const draw=(material:THREE.RawShaderMaterial,target:THREE.WebGLRenderTarget|null)=>{this.quad.material=material;renderer.setRenderTarget(target);this.quad.render(renderer);};
    this.uniforms.sourceColor!.value=readBuffer.texture;
    if(this.uniforms.preRegionContrastStrength!.value>0){
      draw(this.preRegionContrastMaterial,this.preRegionContrastTarget);
      this.uniforms.sourceColor!.value=this.preRegionContrastTarget.texture;
    }
    if(this.uniforms.directionStrength!.value>0)draw(this.structureMaterial,this.structure);
    this.uniforms.structureField!.value=this.structure.texture;
    draw(this.initMaterial,this.centers[0]);let current=0;
    const bind=()=>{this.uniforms.centerColor!.value=this.centers[current]!.textures[0];this.uniforms.centerData!.value=this.centers[current]!.textures[1];
      this.uniforms.centerMass!.value=this.centers[current]!.textures[2];this.uniforms.centerBounds!.value=this.centers[current]!.textures[3];};
    let activeLabels:THREE.WebGLRenderTarget|null=null;
    const assignLabels=()=>{
      const phases=activeLabels&&this.uniforms.neighborStrength!.value>0?[0,1]:[-1];
      for(const phase of phases){
        const target=activeLabels===this.labels?this.mergedLabels:this.labels;
        // Even the inactive sampler must not alias the draw attachment.
        this.uniforms.previousAssignments!.value=(activeLabels??this.mergedLabels).texture;
        this.uniforms.hasPreviousLabels!.value=activeLabels?1:0;this.uniforms.labelPhase!.value=phase;
        draw(this.assignMaterial,target);activeLabels=target;
      }
      this.uniforms.assignments!.value=activeLabels!.texture;
    };
    for(let i=0;i<this.iterations;i++){
      bind();assignLabels();
      draw(this.updateMaterial,this.centers[1-current]!);current=1-current;
    }
    bind();assignLabels();
    if(this.mergeRounds>0||this.uniforms.neighborStrength!.value>0){
      // Final assignments can differ from the last update. Re-gather exact
      // areas, bounds and means before building the region adjacency graph.
      draw(this.updateMaterial,this.centers[1-current]!);current=1-current;bind();
      if(this.uniforms.fineToneStrength!.value>0)draw(this.fineToneMaterial,this.fineToneTarget);
      let labels=activeLabels!,spare=labels===this.labels?this.mergedLabels:this.labels;
      for(let i=0;i<this.mergeRounds;i++){
        draw(this.chooseMergeMaterial,this.choices);this.uniforms.mergeChoices!.value=this.choices.texture;
        draw(this.mergeCentersMaterial,this.centers[1-current]!);current=1-current;bind();
        draw(this.mergeLabelsMaterial,spare);[labels,spare]=[spare,labels];this.uniforms.assignments!.value=labels.texture;
      }
    }
    if(this.mergeRounds===0&&this.uniforms.neighborStrength!.value===0&&this.uniforms.fineToneStrength!.value>0)draw(this.fineToneMaterial,this.fineToneTarget);
    draw(this.composeMaterial,this.renderToScreen?null:writeBuffer);
  }
  dispose(){for(const m of[this.initMaterial,this.structureMaterial,this.assignMaterial,this.updateMaterial,this.composeMaterial,this.fineToneMaterial,this.preRegionContrastMaterial,this.chooseMergeMaterial,this.mergeCentersMaterial,this.mergeLabelsMaterial])m.dispose();
    this.centers.forEach(t=>t.dispose());this.labels.dispose();this.mergedLabels.dispose();this.choices.dispose();this.structure.dispose();this.fineToneTarget.dispose();this.preRegionContrastTarget.dispose();this.quad.dispose();}
}
