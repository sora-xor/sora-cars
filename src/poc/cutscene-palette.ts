/**
 * Actual RGB pixels from public/assets/story/angles/garage-wide-v2.png.
 * OKLab medoids were measured on a 3 px sampling grid, split by hue family and
 * weighted by lightness strata so dark background area did not dominate.
 * Six sparse cream, denim and vermilion accents use nearest reference pixels
 * to their family anchors. These constants color the live 3D rendering.
 */
export const CUTSCENE_PIGMENTS = [
  // Charcoal, warm grey and ivory.
  '#08080f', '#342b30', '#6d6566', '#afa296', '#dbc29e', '#dfd2cf',
  // Ink blue, indigo and workwear blue.
  '#1a2036', '#283356', '#37359a', '#535d75', '#446385', '#667da1',
  // Aubergine shadows and the violet/pink sky.
  '#242134', '#3d334b', '#4b3695', '#84469d', '#b9589f', '#d7bfce',
  // Oxide red, vermilion enamel and rose.
  '#3c1218', '#602728', '#854141', '#b8392a', '#df5339', '#d95d84',
  // Warm earth and amber reflected light.
  '#24110b', '#41281f', '#573a2e', '#734a36', '#905e40',
  '#bc6c3a', '#a47a5f', '#ca8e5c', '#dea672', '#f3c695',
  // Olive shadow, ochre, gold and cream practical-light highlights.
  '#231808', '#3d3626', '#5a4e35', '#7e6b47', '#a6844d',
  '#c69f66', '#efb86b', '#f9d690', '#fdf1bf',
  // Muted green clothing and teal accents.
  '#122e27', '#305147', '#4e7663', '#769a74', '#c2cc83',
] as const;

function pigmentOKLab(hex: string): [number, number, number] {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const [r, g, b] = rgb as [number, number, number];
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [
    .2104542553*l + .793617785*m - .0040720468*s,
    1.9779984951*l - 2.428592205*m + .4505937099*s,
    .0259040371*l + .7827717662*m - .808675766*s,
  ];
}
const pigmentTerms = CUTSCENE_PIGMENTS.map(hex => {
  const lab = pigmentOKLab(hex).map(v => v.toFixed(8));
  return `cutsceneAddPigment(vec3(${lab.join(',')}), massLab, pigmentSum, pigmentWeight);`;
}).join('\n');

/** After OutputPass: source, coherent paint mass and result are display sRGB. */
export const cutscenePaletteDeclarations = /* glsl */ `
  vec3 cutsceneToOKLab(vec3 srgb) {
    srgb=clamp(srgb,0.,1.);
    vec3 low=srgb/12.92;
    vec3 high=pow((srgb+.055)/1.055,vec3(2.4));
    vec3 linear=mix(low,high,step(vec3(.04045),srgb));
    vec3 lms=vec3(
      dot(linear,vec3(.4122214708,.5363325363,.0514459929)),
      dot(linear,vec3(.2119034982,.6806995451,.1073969566)),
      dot(linear,vec3(.0883024619,.2817188376,.6299787005)));
    lms=pow(max(lms,vec3(0.)),vec3(1./3.));
    return vec3(
      dot(lms,vec3(.2104542553,.793617785,-.0040720468)),
      dot(lms,vec3(1.9779984951,-2.428592205,.4505937099)),
      dot(lms,vec3(.0259040371,.7827717662,-.808675766)));
  }
  vec3 cutsceneFromOKLab(vec3 lab) {
    vec3 lms=vec3(
      lab.x+.3963377774*lab.y+.2158037573*lab.z,
      lab.x-.1055613458*lab.y-.0638541728*lab.z,
      lab.x-.0894841775*lab.y-1.2914855480*lab.z);
    lms=lms*lms*lms;
    vec3 linear=max(vec3(0.),vec3(
      dot(lms,vec3(4.0767416621,-3.3077115913,.2309699292)),
      dot(lms,vec3(-1.2684380046,2.6097574011,-.3413193965)),
      dot(lms,vec3(-.0041960863,-.7034186147,1.7076147010))));
    return clamp(mix(linear*12.92,1.055*pow(linear,vec3(1./2.4))-.055,
      step(vec3(.0031308),linear)),0.,1.);
  }
  void cutsceneAddPigment(vec3 pigment,vec3 color,inout vec3 sum,inout float total) {
    // Continuous neighboring-pigment weights settle coherent areas into color
    // families, with smooth transitions rather than a nearest-color staircase.
    // Chroma weight prevents neutral umber from swallowing blue/green accents.
    vec3 difference=(pigment-color)*vec3(1.,1.45,1.45);
    float distanceSquared=dot(difference,difference);
    float weight=1./(.0004+distanceSquared);
    weight*=weight;
    sum+=pigment*weight;total+=weight;
  }
  vec3 cutscenePaletteColor(vec3 sourceSrgb,vec3 clusteredSrgb,float strength) {
    if(strength<=0.) return sourceSrgb;
    vec3 sourceLab=cutsceneToOKLab(sourceSrgb);
    vec3 massLab=cutsceneToOKLab(clusteredSrgb);
    vec3 pigmentSum=vec3(0.);float pigmentWeight=0.;
    ${pigmentTerms}
    vec3 pigment=pigmentSum/max(pigmentWeight,.000001);
    // A palette is a pigment family, not permission to erase modelling. The
    // first direct map crushed tires and flattened the mountain; retain most
    // source lightness while organizing the painted hue/chroma.
    pigment.x=mix(pigment.x,massLab.x,.76);
    pigment.yz=mix(massLab.yz,pigment.yz,.82);
    // Preserve fine value contrast but constrain the chroma residual so fine
    // texture continues to belong to its broader painted color family.
    vec3 residual=sourceLab-massLab;
    vec3 retainedDetail=vec3(clamp(residual.x,-.16,.16),
      clamp(residual.y,-.035,.035)*.70,clamp(residual.z,-.035,.035)*.70);
    vec3 paintedLab=pigment+retainedDetail;
    float detailGuard=smoothstep(.10,.22,abs(residual.x));
    paintedLab=mix(paintedLab,sourceLab,detailGuard*.65);
    return mix(sourceSrgb,cutsceneFromOKLab(paintedLab),clamp(strength,0.,1.));
  }
`;
