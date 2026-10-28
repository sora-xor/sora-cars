import * as THREE from 'three';

/** These are material palettes, not a nearest-colour filter for the final frame. */
export type IllustratedPigmentFamily = 'ivory-enamel' | 'oxide-enamel' | 'cabinet-enamel' | 'workshop-steel' | 'architectural-steel' | 'charcoal-trim' | 'charcoal-rubber';
type SixPigments = readonly [string, string, string, string, string, string];

interface PigmentDefinition {
  cool: SixPigments;
  warm: SixPigments;
  /** Incident diffuse energy, before log encoding; five boundaries, six fills. */
  edges: readonly [number, number, number, number, number];
  /** How much the original albedo changes a pigment: decals 1, steel tooth .3. */
  albedoResidual: number;
}

/**
 * Warm anchors are actual pixels sampled from the corresponding painted object
 * in garage-wide-v2.png. Cool companions deliberately extend its charcoal / ink
 * blue / muted violet family to the unlit side. They are authored display-sRGB
 * targets; the helper below reverses this project's Three ACES output transform.
 *
 * Do not derive these colours by multiplying the object's current PBR output:
 * the change of hue between pigment levels is the point of this material model.
 */
export const ILLUSTRATED_PIGMENT_PALETTES: Record<IllustratedPigmentFamily, PigmentDefinition> = {
  'ivory-enamel': {
    cool: ['#39343d', '#666271', '#948b90', '#b4a59c', '#d6c3b4', '#e8dbd0'],
    warm: ['#39343d', '#7c6b64', '#a58b78', '#c4a177', '#e2c5a1', '#f2dcb5'],
    edges: [.045, .11, .23, .46, .88],
    albedoResidual: 1,
  },
  'oxide-enamel': {
    cool: ['#2f232d', '#503043', '#783343', '#913446', '#a54350', '#bd625e'],
    warm: ['#2f232d', '#513130', '#783343', '#963843', '#b5523b', '#d77650'],
    edges: [.045, .11, .23, .46, .88],
    albedoResidual: 1,
  },
  'cabinet-enamel': {
    // Restrained red companions to the reference's painted tool cabinets.
    // These are authored display targets, not measured material albedos.
    cool: ['#201820', '#39212a', '#582b34', '#78353a', '#9a4845', '#bc6857'],
    warm: ['#23191e', '#452328', '#682b2d', '#8b362e', '#ab4c37', '#c27449'],
    edges: [.045, .12, .28, .63, 1.30],
    albedoResidual: .35,
  },
  'workshop-steel': {
    cool: ['#161826', '#29293a', '#383a47', '#535565', '#777b8b', '#a3a6b0'],
    warm: ['#161826', '#29293a', '#383a47', '#5d4f4d', '#826149', '#b59354'],
    edges: [.045, .12, .28, .63, 1.30],
    albedoResidual: .3,
  },
  'charcoal-rubber': {
    // Authored restrained companions to the reference's dark blue/umber ink,
    // not measured cutscene swatches. Keep the body value dark while separating
    // facing planes: only strongly illuminated catches reach the final grey.
    cool: ['#10121b', '#18202d', '#222d3d', '#303e50', '#475568', '#6c7684'],
    warm: ['#10121b', '#1e2028', '#2b2c32', '#3c3b39', '#575345', '#81775f'],
    edges: [.04, .12, .32, .80, 1.80],
    albedoResidual: 1,
  },
  'architectural-steel': {
    // The reference holds large structural planes in blue/umber shadow;
    // sparse exposed edges carry the bright amber, rather than whole panels.
    cool: ['#10121e', '#191d2b', '#252638', '#353347', '#474259', '#6c635b'],
    warm: ['#10121e', '#201d29', '#302b36', '#483b3d', '#705244', '#a88251'],
    edges: [.045, .12, .28, .63, 1.30],
    albedoResidual: .22,
  },
  'charcoal-trim': {
    cool: ['#0d101a', '#121724', '#1a2230', '#242b39', '#394250', '#535b66'],
    warm: ['#0d101a', '#171821', '#24242b', '#34312f', '#4b443a', '#716450'],
    edges: [.05, .16, .45, 1.0, 2.4],
    albedoResidual: 1,
  },
};

// Row-major spelling of the matrices in Three's tonemapping_pars_fragment.
const acesInput = new THREE.Matrix3().set(
  .59719, .35458, .04823,
  .07600, .90834, .01566,
  .02840, .13383, .83777,
);
const acesOutput = new THREE.Matrix3().set(
  1.60475, -.53108, -.07367,
  -.10208, 1.10813, -.00605,
  -.00327, -.07276, 1.07602,
);
const inverseAcesInput = acesInput.clone().invert();
const inverseAcesOutput = acesOutput.clone().invert();

function inverseRrtOdt(value: number): number {
  // Positive root of Three's fitted rational RRT/ODT curve. Values below the
  // curve's toe map to zero. Muted authored colours stay within the positive
  // scene-linear gamut; clipping only guards accidental future saturated input.
  const y = THREE.MathUtils.clamp(value, 0, .999);
  const a = 1 - .983729 * y;
  const b = .0245786 - .4329510 * y;
  const c = -.000090537 - .238081 * y;
  return Math.max(0, (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a));
}

/**
 * Scene-linear radiance which Three ACES + sRGB encoding maps to this swatch.
 * Exposure must match the renderer's output pass. Subsequent AO, reflection,
 * clearcoat, bloom and ink naturally change the composite; this calibrates only
 * the diffuse pigment contribution. No second tone map belongs in the shader.
 */
export function linearHdrForDisplayPigment(hex: string, exposure = 1): THREE.Color {
  const target = new THREE.Color(hex);
  const fitted = new THREE.Vector3(target.r, target.g, target.b).applyMatrix3(inverseAcesOutput);
  fitted.set(inverseRrtOdt(fitted.x), inverseRrtOdt(fitted.y), inverseRrtOdt(fitted.z));
  fitted.applyMatrix3(inverseAcesInput).multiplyScalar(.6 / Math.max(.001, exposure));
  return new THREE.Color(
    THREE.MathUtils.clamp(fitted.x, 0, 64),
    THREE.MathUtils.clamp(fitted.y, 0, 64),
    THREE.MathUtils.clamp(fitted.z, 0, 64),
  );
}

export interface IllustratedPigmentSelection {
  family: IllustratedPigmentFamily;
  uniforms: {
    soraPigmentCool: { value: THREE.Color[] };
    soraPigmentWarm: { value: THREE.Color[] };
    soraPigmentEdges: { value: number[] };
    soraPigmentBaseAlbedo: { value: THREE.Color };
    soraPigmentAlbedoResidual: { value: number };
    soraPigmentBoundaryStrength: { value: number };
    soraPigmentInteriorStrength: { value: number };
    soraPigmentContinuous: { value: number };
    soraPigmentInteriorLift: { value: number };
  };
}

// Verified against sora-ae86/ae86.glb and the two engine construction modules.
// No substring matching: cast metal, rims, lettering, glass, painted leads and
// deliberately black grille recesses must retain their own material response.
const CHARCOAL_MATERIALS = new Set([
  'Trim1',
  'TireMaterial',
  'Engine bay / charcoal stamped recesses',
  'Engine bay / hoses and moulded cases',
  'Engine / rubber hoses and belt',
  'Hood / charcoal inner skin',
  'Hood / phosphate inner pressing',
]);

function usesCharcoalPigments(material: THREE.MeshStandardMaterial): boolean {
  // Incident diffuse cannot recover a meaningful normal response from a pure
  // metal. Even a familiar name is rejected if its material is changed later.
  if (!Number.isFinite(material.metalness) || material.metalness > .35) return false;
  const { r, g, b } = material.color;
  const peak = Math.max(r, g, b), floor = Math.min(r, g, b);
  if (!Number.isFinite(peak) || peak <= .0005) return false;
  if (CHARCOAL_MATERIALS.has(material.name)) return true;
  // Secondary is the two-tone body coating. Appearance selection darkens its
  // accent colour; retain this guard so a future bright recolour cannot be
  // mistaken for charcoal paint.
  return material.name === 'Secondary' && peak < .08 && (peak - floor) / peak < .28;
}

/**
 * Deliberately narrow opt-in: cream/neutral Primary enamel, red Primary enamel,
 * authored workshop steel, and verified dielectric rubber/charcoal materials.
 * Unknown paint families retain their existing material. Call after appearance
 * colours are applied; rebuild after recolour.
 */
export function pickIllustratedPigments(
  material: THREE.MeshStandardMaterial,
  exposure = 1,
): IllustratedPigmentSelection | null {
  let family: IllustratedPigmentFamily;
  if (usesCharcoalPigments(material)) {
    family = material.name === 'Trim1' || material.name === 'Secondary' || material.name === 'Hood / charcoal inner skin'
      || material.name === 'Hood / phosphate inner pressing' ? 'charcoal-trim' : 'charcoal-rubber';
  } else if (material.userData.workshopEdgePaint === 'cabinet'
    && Number.isFinite(material.metalness) && material.metalness <= .35) {
    family = 'cabinet-enamel';
  } else if (material.name === 'Painted workshop enamel') {
    family = material.userData.illustratedArchitecture ? 'architectural-steel' : 'workshop-steel';
  } else if (material.name === 'Primary') {
    const { r, g, b } = material.color;
    const peak = Math.max(r, g, b);
    if (r > .06 && r > g * 1.5 && r > b * 1.5) family = 'oxide-enamel';
    else if (peak > .12 && (peak - Math.min(r, g, b)) / peak < .5) family = 'ivory-enamel';
    else return null;
  } else return null;
  const palette = ILLUSTRATED_PIGMENT_PALETTES[family];
  const baseAlbedo = material.color.clone();
  if (family === 'workshop-steel' || family === 'architectural-steel') {
    // Measured channel medians of steel-v1.png, decoded to linear sRGB. A map
    // residual must be relative to this material's centre, not relative to white:
    // otherwise a blue-charcoal map would multiply the new palette dark twice.
    baseAlbedo.multiply(new THREE.Color(.07818742, .08865559, .10461648));
  }
  if (family === 'charcoal-rubber') {
    // Installed Three r186 keeps PhysicalMaterial.diffuseColor unattenuated;
    // its separate diffuseContribution applies (1 - metalness). The helper
    // receives diffuseColor, so its residual reference must do the same.
    if (material.name === 'TireMaterial' && material.map) {
      // Embedded source WebP: non-zero texel median is 24/255 sRGB, decoded
      // below. Most of the atlas is unused black padding. A white reference
      // would crush the authored tread/lettering residual back towards black;
      // a zero median over the entire atlas would instead amplify everything.
      baseAlbedo.multiplyScalar(.009134058702220787);
    }
  }
  return {
    family,
    uniforms: {
      soraPigmentCool: { value: palette.cool.map(hex => linearHdrForDisplayPigment(hex, exposure)) },
      soraPigmentWarm: { value: palette.warm.map(hex => linearHdrForDisplayPigment(hex, exposure)) },
      soraPigmentEdges: { value: palette.edges.map(energy => Math.log2(1 + energy * 3)) },
      soraPigmentBaseAlbedo: { value: baseAlbedo },
      soraPigmentAlbedoResidual: { value: palette.albedoResidual },
      // These marks move connected colour regions, not a grain multiplier over
      // every flat fill. Quiet enamel and rubber use a narrower paint range.
      soraPigmentBoundaryStrength: { value: family==='ivory-enamel'||family==='oxide-enamel'
        ? .28 : family==='charcoal-rubber' ? .24 : family==='charcoal-trim' ? .65
        : family==='cabinet-enamel' ? .12 : .36 },
      // Sparse secondary brush loads belong inside darker painted planes.
      // Car enamel retains its dedicated atlas; rubber stays deliberately quiet.
      soraPigmentInteriorStrength: { value: family === 'ivory-enamel' || family === 'oxide-enamel'
        ? 0 : family === 'charcoal-rubber' ? .10 : family === 'architectural-steel' ? .18
        : family === 'workshop-steel' ? .30 : .65 },
      // Keep some form variation between neighbouring paint colours. Cabinet
      // enamel is least stepped; dark architecture retains stronger grouping.
      soraPigmentContinuous: { value: family==='cabinet-enamel' ? .65
        : family==='architectural-steel' ? .25 : family==='charcoal-trim' ? .45 : .35 },
      // Phosphate panels in the reference carry lighter slate brush loads
      // inside their dark coating. Rubber and cabinet paint use darker loads.
      soraPigmentInteriorLift: { value: material.name==='Hood / charcoal inner skin'
        || material.name==='Hood / phosphate inner pressing' ? 1 : 0 },
    },
  };
}

/**
 * Integration contract:
 * 1. Accumulate original PHYSICAL direct/indirect diffuse, before any per-light
 *    illustration or ambient floor. Pass those untouched values to this helper.
 * 2. Call once after lights_fragment_end with material.diffuseColor and an
 *    object-attached 0..1 brush mark. Its result REPLACES the summed diffuse.
 * 3. Do not add the old shadowPaint/indirectShape afterward. Preserve all
 *    specular, clearcoat, transmission, AO and linework stages independently.
 * 4. Splitting the returned sum into direct / indirect is the caller's choice;
 *    use the physical luminance ratio if later material AO affects only indirect.
 */
export const illustratedPigmentDeclarations = /* glsl */ `
  uniform vec3 soraPigmentCool[6];
  uniform vec3 soraPigmentWarm[6];
  uniform float soraPigmentEdges[5];
  uniform vec3 soraPigmentBaseAlbedo;
  uniform float soraPigmentAlbedoResidual;
  uniform float soraPigmentBoundaryStrength;
  uniform float soraPigmentInteriorStrength;
  uniform float soraSurfaceInteriorStrength;
  uniform float soraPigmentContinuous,soraPigmentContinuousStrength;
  uniform float soraPigmentInteriorLift;

  float pigmentLuminance(vec3 color) {
    return dot(color, vec3(.2126, .7152, .0722));
  }

  vec3 illustratedPigmentDiffuse(vec3 physicalDirect, vec3 physicalIndirect,
    vec3 albedo, float attachedMark, float interiorMark, float interiorAmount) {
    vec3 physicalTotal = max(vec3(0.), physicalDirect + physicalIndirect);
    float albedoEnergy = max(pigmentLuminance(albedo), .0001);
    float incident = pigmentLuminance(physicalTotal) / albedoEnergy;
    float level = log2(1. + incident * 3.);

    // Estimate illumination hue after removing the object's diffuse dye. This
    // makes a red car under blue skylight choose the cool red family instead of
    // mistaking its red pigment for a warm light. Near-zero dyed channels carry
    // little signal, so cap their contribution rather than amplifying them.
    vec3 irradiance = physicalTotal / max(albedo, vec3(.015));
    float warmth = (irradiance.r - irradiance.b)
      / max(pigmentLuminance(irradiance), .001);
    float warmWeight = smoothstep(-.18, .34, warmth);

    // Preserve the existing light-band response independently of the optional
    // interior brush load. Zero interior strength retains the exact old fill.
    float edgeWidth = max(.017, fwidth(level) * .72);
    float paintLevel = level + (clamp(attachedMark, 0., 1.) - .5) * soraPigmentBoundaryStrength;
    vec3 pigment = mix(soraPigmentCool[0], soraPigmentWarm[0], warmWeight);
    vec3 interiorPigment = mix(soraPigmentCool[0], soraPigmentWarm[0], warmWeight * .25);
    interiorPigment=mix(interiorPigment,mix(soraPigmentCool[0],soraPigmentCool[2],.7),soraPigmentInteriorLift);
    for (int i = 0; i < 5; i++) {
      float transition = smoothstep(soraPigmentEdges[i] - edgeWidth,
        soraPigmentEdges[i] + edgeWidth, paintLevel);
      float lowerStop=0.;
      float upperStop=soraPigmentEdges[4]+(soraPigmentEdges[4]-soraPigmentEdges[3])*.5;
      if(i>0)lowerStop=(soraPigmentEdges[i-1]+soraPigmentEdges[i])*.5;
      if(i<4)upperStop=(soraPigmentEdges[i]+soraPigmentEdges[i+1])*.5;
      float continuous=smoothstep(lowerStop,upperStop,paintLevel);
      transition=mix(transition,continuous,soraPigmentContinuous*soraPigmentContinuousStrength);
      vec3 nextPigment = mix(soraPigmentCool[i + 1], soraPigmentWarm[i + 1], warmWeight);
      pigment = mix(pigment, nextPigment, transition);
      // Select a cool neighbouring paint, rather than multiplying noisy grey
      // over the surface. Each alternate remains tied to its own light band.
      vec3 nextInterior = mix(
        mix(soraPigmentCool[i + 1], soraPigmentWarm[i + 1], warmWeight * .25),
        soraPigmentCool[i], .55);
      int liftedIndex=min(i+3,5);
      vec3 lifted=mix(soraPigmentCool[i+1],soraPigmentCool[liftedIndex],.7);
      nextInterior=mix(nextInterior,lifted,soraPigmentInteriorLift);
      interiorPigment = mix(interiorPigment, nextInterior, transition);
    }

    // A brush load crosses a lighting-band boundary as one connected stroke.
    // Its alternate colours follow the same continuous transition above; a
    // separate distance-to-band gate would erase paint on evenly lit planes.
    // Filter the attached mask itself, including on constant-light surfaces.
    float markFootprint = fwidth(interiorMark);
    float markWidth = clamp(markFootprint * .70, .015, .10);
    float patchResolved = 1. - smoothstep(.16, .42, markFootprint);
    float patchCoverage = smoothstep(.52 - markWidth, .68 + markWidth,
      clamp(interiorMark, 0., 1.)) * patchResolved;
    if (interiorAmount > 0.) {
      pigment = mix(pigment, interiorPigment,
        patchCoverage * clamp(interiorAmount, 0., 1.));
    }

    // The ramp defines this material's centre, while painted decals and dirt
    // remain changes to its albedo. Steel's photographic microvariation is
    // intentionally quieter; enamel retains the complete coloured mask.
    vec3 albedoRatio = clamp(albedo / max(soraPigmentBaseAlbedo, vec3(.001)), 0., 3.);
    pigment *= pow(albedoRatio, vec3(soraPigmentAlbedoResidual));

    // There is no emissive minimum shadow colour. With no incoming energy this
    // material is black; under weak light it emerges continuously into band 0.
    return pigment * smoothstep(0., .025, incident);
  }
`;
