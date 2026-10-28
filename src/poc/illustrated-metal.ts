import type * as THREE from 'three';
import { linearHdrForDisplayPigment } from './illustrated-pigments';

/** Include in the owning material's customProgramCacheKey. */
export const ILLUSTRATED_METAL_STYLE_VERSION = 'engine-pigment-v4';

/** Maximum deviation from the supplied shading normal: twelve degrees. */
export const ILLUSTRATED_METAL_NORMAL_MAX_RADIANS = Math.PI / 15;

export type IllustratedMetalFamily = 'cast-aluminium' | 'machined-aluminium' | 'oxidised-iron' | 'brass' | 'heat-stained-steel';
type SixPigments = readonly [string, string, string, string, string, string];

interface EnginePigmentProfile {
  cool: SixPigments;
  stroke: SixPigments;
  warm: readonly [string, string];
  reflectionEdges: readonly [number, number, number, number, number];
}

/**
 * Authored display-sRGB targets, not sampled material measurements. The second
 * fill is a deliberately visible brush load inside each reflection band. It
 * changes pigment value and hue without requiring a lighting boundary there.
 * Brass retains its restrained ochre dye; hot steel has violet/umber oxidation;
 * iron stays appreciably darker than either aluminium finish at equal energy.
 */
export const ILLUSTRATED_ENGINE_METAL_PROFILES: Record<IllustratedMetalFamily, EnginePigmentProfile> = {
  'cast-aluminium': {
    cool: ['#111722', '#1d2632', '#34404c', '#59646d', '#8a9498', '#c7c7b6'],
    stroke: ['#182536', '#2b3c4c', '#485c6b', '#768894', '#aeb9bd', '#ece5c7'],
    warm: ['#b99158', '#eed2a0'],
    reflectionEdges: [.007, .022, .060, .160, .42],
  },
  'machined-aluminium': {
    cool: ['#101720', '#202b35', '#3b4b58', '#63737e', '#9daab0', '#dbe0d7'],
    stroke: ['#1c2c3b', '#354c5c', '#607789', '#9cacb6', '#cbd6d8', '#faefd2'],
    warm: ['#c6b28b', '#f2e3bd'],
    reflectionEdges: [.010, .032, .085, .230, .70],
  },
  'oxidised-iron': {
    cool: ['#080b12', '#101621', '#1a2532', '#2c3947', '#46535e', '#78817f'],
    stroke: ['#121d2a', '#223443', '#394d5c', '#526976', '#7e8f98', '#b1b6ac'],
    warm: ['#776149', '#b79a6d'],
    reflectionEdges: [.012, .040, .110, .300, .80],
  },
  brass: {
    cool: ['#181719', '#29271f', '#514635', '#84704e', '#b9a274', '#dac6a0'],
    stroke: ['#27302f', '#484f42', '#777a5a', '#aaa276', '#dbca92', '#f1dda9'],
    warm: ['#c0944c', '#f2d18b'],
    reflectionEdges: [.007, .020, .055, .150, .40],
  },
  'heat-stained-steel': {
    cool: ['#14141e', '#2b2736', '#483b49', '#6c5357', '#978073', '#c1b4a0'],
    stroke: ['#1e2939', '#394657', '#59667a', '#8592a1', '#b5bdc2', '#ded8c8'],
    warm: ['#a67c56', '#d9b481'],
    reflectionEdges: [.010, .030, .085, .230, .65],
  },
};

/** Existing diagnostics may use the cast finish as the default profile. */
export const ILLUSTRATED_ENGINE_METAL_PALETTE = ILLUSTRATED_ENGINE_METAL_PROFILES['cast-aluminium'];

export interface IllustratedMetalSelection {
  family: IllustratedMetalFamily;
  strength: number;
  /** Warm accent control on the existing 0–.12 range; .12 permits full coverage. */
  accent: number;
  /** Merge into the owning shader's uniforms alongside the shared controls. */
  uniforms: {
    soraEnginePigmentCool: { value: THREE.Color[] };
    soraEnginePigmentStroke: { value: THREE.Color[] };
    soraEnginePigmentWarm: { value: THREE.Color[] };
    soraEnginePigmentEdges: { value: number[] };
  };
}

const ENGINE_METALS = new Map<string, Omit<IllustratedMetalSelection, 'uniforms'>>([
  ['Engine / cast aluminium', { family: 'cast-aluminium', strength: .90, accent: .035 }],
  ['Engine / machined aluminium edges', { family: 'machined-aluminium', strength: .80, accent: .12 }],
  ['Engine / oxidised iron', { family: 'oxidised-iron', strength: .94, accent: .015 }],
  ['Engine / brass fittings', { family: 'brass', strength: .82, accent: .075 }],
  ['Engine / heat-stained steel headers', { family: 'heat-stained-steel', strength: .90, accent: .035 }],
]);

/** Exact material ownership: painted covers, hoses, letters and leads are excluded. */
export function pickIllustratedEngineMetal(
  material: Pick<THREE.MeshStandardMaterial, 'name' | 'metalness'>,
): IllustratedMetalSelection | null {
  if (!Number.isFinite(material.metalness) || material.metalness <= .45) return null;
  const selection = ENGINE_METALS.get(material.name);
  if (!selection) return null;
  const profile = ILLUSTRATED_ENGINE_METAL_PROFILES[selection.family];
  return { ...selection, uniforms: {
    soraEnginePigmentCool: { value: profile.cool.map(hex => linearHdrForDisplayPigment(hex)) },
    soraEnginePigmentStroke: { value: profile.stroke.map(hex => linearHdrForDisplayPigment(hex)) },
    soraEnginePigmentWarm: { value: profile.warm.map(hex => linearHdrForDisplayPigment(hex)) },
    soraEnginePigmentEdges: { value: profile.reflectionEdges.map(energy => Math.log2(1 + energy * 16)) },
  } };
}

/**
 * Apply the pigment response once to accumulated original direct + indirect
 * specular RGB. The caller preserves native diffuse and skips the generic
 * per-light specular, diffuse shadow floor and matcap replacement for selected
 * engine materials. The older scalar-only diagnostic remains available below.
 *
 * Actual reflection energy shapes the authored slate fills and warm accents.
 * Surface-attached paint moves boundaries and picks neighbouring pigment fills;
 * it never emits light or supplies a replacement environment reflection.
 * Independent lobe authoring follows the production principles described in
 * DreamWorks' SIGGRAPH 2025 "Painterly Fur and Feathers of The Wild Robot" and
 * OpenMoonRay's DwaToonMaterial; these constants are this POC's own controls.
 */
export const illustratedMetalDeclarations = /* glsl */`
  uniform vec3 soraEnginePigmentCool[6];
  uniform vec3 soraEnginePigmentStroke[6];
  uniform vec3 soraEnginePigmentWarm[2];
  uniform float soraEnginePigmentEdges[5];

  /** Both tangents and the original normal must be in the same view-space
   * frame. The caller handles double-sided orientation and enabled strength.
   * Marks choose neighbouring painted planes, not derivatives of bump height.
   */
  vec3 illustratedMetalNormal(vec3 sourceNormal,vec3 tangent,vec3 bitangent,
    float markA,float markB,float strength){
    vec2 marks=clamp(vec2(markA,markB),vec2(0.),vec2(1.));
    // Evaluate derivatives before any potentially nonuniform fallback branch.
    vec2 footprint=fwidth(marks);
    vec2 transitionWidth=clamp(footprint*.70,vec2(.012),vec2(.12));
    float resolved=1.-smoothstep(.18,.45,max(footprint.x,footprint.y));
    float amount=clamp(strength,0.,1.)*resolved;
    if(amount<=0.)return sourceNormal;

    float normalLength=dot(sourceNormal,sourceNormal);
    if(!(normalLength>1.e-12&&normalLength<1.e20))return sourceNormal;
    vec3 n=sourceNormal*inversesqrt(normalLength);
    vec3 t=tangent-n*dot(n,tangent);
    vec3 b=bitangent-n*dot(n,bitangent);
    float tangentLength=dot(t,t),bitangentLength=dot(b,b);
    if(!(tangentLength>1.e-12&&tangentLength<1.e20)){
      if(!(bitangentLength>1.e-12&&bitangentLength<1.e20))return sourceNormal;
      b*=inversesqrt(bitangentLength);
      t=normalize(cross(b,n));
    }else{
      t*=inversesqrt(tangentLength);
      b-=t*dot(t,b);
      bitangentLength=dot(b,b);
      if(!(bitangentLength>1.e-12&&bitangentLength<1.e20))b=cross(n,t);
      else b*=inversesqrt(bitangentLength);
    }

    // Three quiet plane choices per axis. Only their painted boundaries blend;
    // the middle choice leaves the original surface normal exactly unchanged.
    vec2 plane=-vec2(1.)
      +smoothstep(vec2(.34)-transitionWidth,vec2(.34)+transitionWidth,marks)
      +smoothstep(vec2(.66)-transitionWidth,vec2(.66)+transitionWidth,marks);
    float planeLength=dot(plane,plane);
    if(planeLength<1.e-12)return sourceNormal;
    plane*=inversesqrt(max(1.,planeLength));
    float tilt=tan(${ILLUSTRATED_METAL_NORMAL_MAX_RADIANS.toFixed(10)}*amount);
    // The orthogonal offset and bounded tilt keep the result in the original
    // positive hemisphere, including diagonal plane choices and repaired bases.
    return normalize(n+(t*plane.x+b*plane.y)*tilt);
  }

  /** Call once on original direct + indirect reflection, before AO. Split the
   * result by their original luminance ratio afterward. This deliberately
   * authors pigment hue independently of the source reflection's brown tint.
   */
  vec3 illustratedMetalPigment(vec3 summedPhysicalReflection,float attachedMark,
    float paintStrength,float warmAccent){
    vec3 source=max(summedPhysicalReflection,vec3(0.));
    float energy=dot(source,vec3(.2126,.7152,.0722));
    float mark=clamp(attachedMark,0.,1.);
    float markWidth=clamp(fwidth(mark)*.65,.018,.10);
    float markResolve=1.-smoothstep(.14,.45,fwidth(mark));
    // Existing attached chisel marks choose discrete neighbouring pigments.
    // Minified marks fade to the quiet fill instead of becoming distant grit.
    float stroke=smoothstep(.52-markWidth,.70+markWidth,mark)*markResolve;
    float level=log2(1.+16.*energy);
    float paintedLevel=level+(mark-.5)*.32*markResolve;
    float edgeWidth=clamp(fwidth(level)*.70,.020,.11);
    vec3 pigment=mix(soraEnginePigmentCool[0],soraEnginePigmentStroke[0],stroke);
    for(int i=0;i<5;i++){
      pigment=mix(pigment,mix(soraEnginePigmentCool[i+1],soraEnginePigmentStroke[i+1],stroke),
        smoothstep(soraEnginePigmentEdges[i]-edgeWidth,
          soraEnginePigmentEdges[i]+edgeWidth,paintedLevel));
    }

    // A broad reflection cannot become an unbroken amber rim. Warm accents
    // require both a locally strong real reflection and sparse attached paint.
    float warmStroke=smoothstep(.58-markWidth,.75+markWidth,mark)*markResolve;
    float warmLight=smoothstep(.025,.12,energy);
    float warmSource=smoothstep(-.10,.22,(source.r-source.b)/max(energy,.0001));
    float warmCoverage=warmStroke*warmLight*warmSource*clamp(warmAccent/.12,0.,1.)*.90;
    vec3 warmPigment=mix(soraEnginePigmentWarm[0],soraEnginePigmentWarm[1],smoothstep(.30,1.10,energy));
    pigment=mix(pigment,warmPigment,warmCoverage);

    // Light visibility is continuous at zero: neither shadow paint nor strokes
    // emit. Retain a little real high-energy structure without an HDR ceiling.
    vec3 painted=pigment*smoothstep(0.,.008,energy);
    painted+=source*.10*smoothstep(.30,1.20,energy);
    return mix(source,painted,clamp(paintStrength,0.,1.));
  }

  // Retained for the earlier scalar-response diagnostic only. The pigment
  // study above must be evaluated on the sum, not once per reflection lobe.
  vec3 illustratedMetalSpecular(vec3 sourceRGB,float attachedMark,
    float strength,float accent){
    vec3 source=max(sourceRGB,vec3(0.));
    float energy=dot(source,vec3(.2126,.7152,.0722));
    float mark=clamp(attachedMark,0.,1.);

    // Half-stop-like logarithmic intervals preserve HDR highlights instead of
    // flattening every bright reflection against a finite final ramp value.
    float level=log2(1.+16.*energy);
    float bandCoordinate=2.*(level+(mark-.5)*.12);
    float band=floor(bandCoordinate);
    float phase=fract(bandCoordinate);
    float width=clamp(fwidth(bandCoordinate)*.65,.06,.22);
    float paintedLevel=(band+smoothstep(.5-width,.5+width,phase))*.5;
    float paintedEnergy=max(0.,(exp2(paintedLevel)-1.)/16.);
    float bandGain=clamp(paintedEnergy/max(energy,.0001),.60,1.40);
    // Keep tiny fasteners and weak reflections continuous as they enter view.
    float resolvedEnergy=smoothstep(.004,.02,energy);
    float gain=mix(1.,bandGain,clamp(strength,0.,1.)*resolvedEnergy);

    // Light paint can accent a real highlight, with strongest coverage assigned
    // to the explicitly machined material. Broad dark fills stay untouched.
    float strokeWidth=max(.025,fwidth(mark)*.65);
    float stroke=smoothstep(.75-strokeWidth,.90+strokeWidth,mark);
    float litAccent=smoothstep(.08,.30,energy)*stroke;
    gain*=1.+clamp(accent,0.,.12)*litAccent;
    return source*clamp(gain,.60,1.40);
  }
`;
