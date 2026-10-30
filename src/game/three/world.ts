import * as THREE from 'three';
import type { RaceState } from '../engine';
import type { RenderOptions } from '../renderer';
import type { CompiledStreetTrack } from '../street/track';
import type { StreetRenderState, StreetRenderOptions } from '../street/renderer';
import { CONTROL, LIVERIES, TRACKS, curvature, modulo } from '../rules';
import { clubItem, clubLivery } from '../catalog';
import { environmentAt } from '../environment';
import { createCarModel, type CarModel } from './car';
import { createBuilding, createApartment, createTree, createStreetLamp, createSign, setSignGlow, setWindowLights } from './scenery';
import { createCinematicPass, RACE_TONE_MAPPING, RACE_TONE_MAPPING_EXPOSURE } from './cinematic';
import { createPixelArtPass } from './pixel-art/pass';
import { MAX_GROUND_EMITTERS, MAX_HAZARDS, type GroundEmitter, type GroundHazard } from './pixel-art/surfaces';
import { createClusteredLighting } from '../../poc/clustered-lighting';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { scannedSurface, scannedSurfacesReady } from './surfaces';
import { getPixelFinish } from './graphics';
import { loadDetailedCarFleet, setDetailedCarNight } from './asset-car';
import { soraEmblemTexture, soraStripTexture } from './sora-emblem';
import { TailStreaks } from './tail-streaks';
import { loadDetailedScenery } from './asset-scenery';
import { createRoadsideInfrastructure, guardrailGeometry } from './infrastructure';
import { streetPresentation } from '../street/presentation';
import { createDrivingEffects } from './driving-effects';
import { createUnderstory, type UnderstoryField, type UnderstoryPatch } from './undergrowth';
import { createSlopeTerrain, createTerrain, terrainHeightAt, type SlopeTerrain } from './terrain';
import { createUrbanGround } from './urban-ground';
import { createUrbanPavingMaterial } from './urban-paving';
import { TreeBatch } from './tree-batch';
import { VehicleAmbientOcclusion } from './vehicle-ambient';
import { loadShopProps } from './shop-props';
import { createDuskEnvironment } from './dusk-environment';
import { createStreetscape, selectStreetscape, streetscapePlantingClear, type StreetscapeLayout, type StreetscapePlacement } from './streetscape';
import { createCityBlocks, selectCityBlocks, cityBlocksPlantingClear, type CityBlockLayout } from './city-blocks';
import { CityBlockBatch } from './city-block-batch';
import { createGroundHeightSampler } from './ground-sampler';
import { createCityPlots, CityPlotBatch, cityPlotsPlantingClear, type CityPlotLayout } from './city-plots';
import { installSpotlightEarlyOut, prepareSpotlightEarlyOut } from './spotlight-shading';
import { ArchitectureAmbient } from './architecture-ambient';
import { CityGardenBatch, createCityGardens, type CityGardenLayout } from './city-gardens';
import { decorateRoadFinish, shareSpecularLimits, type RoadFinish } from './road-finish';
import { attachShopfront, setShopfrontGlow, shopfrontReady } from './shopfronts';
import { createLocalCarReflections } from './reflections';
import { createPaintedSky, type RacingSkyMood } from '../../poc/painted-sky';
import { pixelArtGrid } from './pixel-art/grid';
import { ARCADE_1986_CROSSINGS, ARCADE_1986_LANDMARKS, ARCADE_1986_STREET, ARCADE_DISTANT, MOAT, MovingFarLights, PeriodCity, QUAY, arcadeDistrictAt, moatWidth, periodCityGroundCut,
  periodCityOpenRuns, periodCityRouteFrame, setPeriodCityLampHeads, setPeriodCityLighting,
  type CityFixture, type PeriodDistrict } from './period-city';
import { streetScene, type StreetScene } from './period-city/street-scenes';
import { setPeriodCityGolden } from './period-city/materials';
import type { PeriodLocals } from './period-city/layout';
import { SIGN_REGIONS } from './period-city/signs';
import { crownLight, crownLightGlsl } from './autumn-foliage';

// Three's +Z-forward models have +X on the driver's LEFT. Native racing
// coordinates are right-positive. Convert once at the boundary: west = +X,
// north = +Z, and native lateral/yaw are negated. Rotations retain positive
// scale so car liveries, signs, normals and shadows remain correctly oriented.
interface Pose { x: number; y: number; z: number; heading: number; width: number; p: number }
interface Course { key: unknown; length: number; circuit: boolean; poses: Pose[]; style: number }
interface VisualCar { retired?: boolean; p: number; lateral: number; yaw: number; slip: number; speed: number; color: string; accent?: string; aero?: boolean; boosting: boolean; braking: boolean; steer: number }
interface Hazard { id: string; kind: 'tree' | 'sign' | 'oil'; p: number; lateral: number; halfWidth: number; halfLength: number; broken: boolean }
interface ShopAreaLightSlot { fixtureId: string | null; gain: number }
const TAU = Math.PI * 2;
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
const clamp = THREE.MathUtils.clamp;

// Race mood, matched to the cutscene art: violet only in the sky and air,
// warm amber practicals, damp reflective asphalt, charcoal foreground shade.
// One daylight value (0 night .. 1 sunrise) drives the lights and the sky.
/** Dusk on the daylight scale; Tokyo's chapters sweep night -> dusk -> sunrise through it. */
const DUSK_DAYLIGHT = 0.45;
/** Dry roads stay damp enough to mirror lamps; rain saturates them. */
/** Tokyo's night road: freshly rained on, mirroring the lamps and signs (the user's rain-night target). */
const DAMP_ROAD_WETNESS = 0.85;
/** Toward sunrise the road dries to this dampness (sunrise-wide's road is dry, dark asphalt). */
const SUNRISE_ROAD_WETNESS = 0.2;
/** Soft ceilings on the key light's road specular (road-finish.ts): a warm
 * sheen at dusk, never a blown glare disc under the low sunrise. */
const KEY_ROAD_SPECULAR_DUSK = 0.3;
const KEY_ROAD_SPECULAR_SUNRISE = 0.06;
/** A late-day route's golden hours: the low sun's glare sheen on the dry asphalt ahead (its repaints). */
const KEY_ROAD_SPECULAR_GOLDEN = 0.2;
/** In the pixel-art finish the spot lights' road specular gets a soft ceiling
 * too (refine round 2): their smooth highlights read as airbrushed blobs, and
 * the pass draws lamp reflections itself (dashed columns, flecks). Clean keeps
 * the full highlights. Linear radiance before exposure. Refine round 4: 0.01
 * (was 0.12): the lamps' overlapping highlights lit a damp dusk road as an even
 * grey sheen (road L median 0.34 against the dusk repaint's 0.23; 0.28 now),
 * where the repaints keep it navy under the pass's own streaks. */
const PIXEL_ROAD_SPOT_SPECULAR = 0.01;
/** Road albedo: lifted for Neutral's toe at night and dusk, darker asphalt
 * under the low sunrise so the key-lit road stays below the lit subjects. */
const ROAD_ALBEDO = new THREE.Color('#b8b6bc');
const ROAD_ALBEDO_SUNRISE = new THREE.Color('#b6b2ba');
/** A late-day route's dry asphalt in the golden hours: a light neutral grey, warmed by the low sun where the camera
 * faces it (a warm albedo turned the road gold where the camera looks away from the sun, and its repaint paints it cool
 * grey-violet). */
const ROAD_ALBEDO_GOLDEN = new THREE.Color('#c6c2c6');
/** Extra hemisphere fill, key light and shadow opening in a late-day route's golden hours. */
const GOLDEN_FILL = 0.3, GOLDEN_KEY = 2, GOLDEN_SHADOW_OPEN = 0.45;
/** The shadow opening with the low sun behind the camera (refine round 4: Nara's true-sun repaints paint the road and
 * verges sunlit, the long tree shadows across them light; at 0.45 the shadowed ground kept 40% of the key and the road
 * read near black). With the sun ahead the backlit ground stays as dark as the Irohazaka repaints keep it. */
const GOLDEN_SHADOW_OPEN_BEHIND = 0.85;
/** A late-day route's lit rooms and shops in its golden hours, and how much brighter they glow (refine round 4: Nara
 * Sanjō's true-sun repaint lights the tea shop and the rooms above it against the low sun, where ours stood dark). */
const GOLDEN_WINDOW_SHARE = 0.9, GOLDEN_WINDOW_GAIN = 0.8;
/** The key light's elevation (rad) in a late-day route's golden hours; the painted sun stays on the horizon. At 8-20
 * degrees the roadside trees' long shadows covered the whole road, which stayed dark under the repaints' sunlit asphalt
 * striped with tree shadows (Irohazaka's near road at 30 degrees: L median 0.45-0.50 against the repaint's 0.46). */
const GOLDEN_KEY_ELEVATION = 0.52;
/** Street lamps fade toward sunrise (the city switching off), keeping weak streaks. */
const SUNRISE_LAMP_GAIN = 0.45;
/** Their pools on the road fade further (refine round 2): at 45% they still
 * washed the sunrise road near the car warm brown (L0.40, h41), where
 * sunrise-wide's road is dark cool slate (L0.26, h293); the lenses keep 45%
 * for weak reflection streaks. */
const SUNRISE_POOL_GAIN = 0.15;
/** Street-lamp pools: a bright amber centre that falls away within ~12 m, so
 * lit asphalt reads as pools over dark violet-brown rather than a wash. */
const LAMP_POOL = { angle: 1.05, penumbra: 0.7, distance: 30 } as const;
/** Autumn maple crowns, tree by tree (the street routes' repaints: crimson, orange and gold). */
const MAPLE_TONES = [
  // Refine round 4: mostly crimson (the repaints' crowns are about 70% crimson, a little vermilion and orange); a third
  // each of crimson, orange and gold read two-thirds orange.
  { color: '#e04a30', emissive: '#8e2a1a' },
  { color: '#d8402c', emissive: '#882418' },
  { color: '#ea6030', emissive: '#96361a' },
  { color: '#e2502e', emissive: '#8e2c1a' },
  { color: '#f08a3a', emissive: '#a84a20' },
] as const;
/** Most direct light (scene-linear luminance of the diffuse) a lamp puts on the cherry crowns beside it at night. */
const BLOSSOM_DIRECT_CAP = 0.35;
/** The same for the street trees' leaves (refine round 4: lit in full by the lamps beside them, Kanda's kerb trees glowed
 * bright yellow, where every night repaint keeps its street trees dark green with a few lamp-lit leaves). */
const FOLIAGE_DIRECT_CAP = 0.08;
/** The same for their trunks and branches (refine round 4: lit in full beside a lamp, the office frame's kerb tree stood
 * as a bright orange trunk and boughs, where its repaint keeps the tree a dark mass with a faint warm side). */
const BARK_DIRECT_CAP = 0.08;
/** The ceiling by day (no effect: the sun lights the crowns in full). */
const DAY_DIRECT_CAP = 50;
/**
 * The autumn maples' crowns take the painted crown light the street-routes session's flora and authored trees use
 * (autumn-foliage.ts crownLightGlsl): the crown keeps its own crimson through light and shade, its sunlit leaves warm
 * toward gold and its highlights stay under the tone curve's shoulder, where plain lighting paled the lit sides to peach.
 * `amount` 0 for the cherries, which keep their own light.
 */
function mapleCrownLight(material: THREE.MeshStandardMaterial, amount: { value: number }): void {
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const baseKey = previousKey === THREE.Material.prototype.customProgramCacheKey ? () => previous.toString() : () => previousKey.call(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.soraCrownLight = crownLight; shader.uniforms.soraMapleLight = amount;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec2 soraCrownLight; uniform float soraMapleLight;\nvoid main() {')
      .replace('#include <opaque_fragment>', `if (soraMapleLight > 0.) ${crownLightGlsl('soraMapleLight')}
  #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${baseKey()}:sora-maple-light-v1`;
}

/**
 * Caps a material's direct diffuse (scene-linear luminance) at `cap` after its own shader hooks (refine round 4), so a
 * lamp beside a crown lights it without blowing it out, and with `specular` its direct specular too (a lamp a metre
 * from a street tree glared off its leaves and bark); the material's own cache key is kept as a prefix.
 */
function capDirectDiffuse(material: THREE.MeshStandardMaterial, cap: { value: number }, key: string, specular = false): void {
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const baseKey = previousKey === THREE.Material.prototype.customProgramCacheKey ? () => previous.toString() : () => previousKey.call(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.soraDirectCap = cap;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float soraDirectCap;\nvoid main() {')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float direct = dot(reflectedLight.directDiffuse, vec3(.2126, .7152, .0722));
    if (direct > soraDirectCap) reflectedLight.directDiffuse *= soraDirectCap / direct;${specular ? `
    float glare = dot(reflectedLight.directSpecular, vec3(.2126, .7152, .0722));
    if (glare > soraDirectCap) reflectedLight.directSpecular *= soraDirectCap / glare;` : ''} }`);
  };
  material.customProgramCacheKey = () => `${baseKey()}:${key}`;
}
/** The harbour's lamp pools: a little wider than the other moods' but not a
 * wash (refine round 1: the 1.3 rad / 42 m cones lit the whole quay road
 * orange-brown, where harbor-wide keeps violet-grey ground between pools with
 * amber flecks near the lamps); the long wet columns come from the wetter road. */
const LAMP_POOL_HARBOR = { angle: 1.1, penumbra: 0.7, distance: 32 } as const;
/** Street-lamp lens (scenery.ts): emissive radiance at the moods' 620 cd, its
 * position in the lamp's frame, and the width of its reflection on wet asphalt
 * for the pixel-art lamp columns (the 0.45 m lens spread by the road's
 * roughness: narrower columns read as stacked glyphs rather than reflections). */
const LAMP_LENS = { radiance: 5, intensity: 620, position: new THREE.Vector3(0, 6.6, -1.28), width: 1.2 } as const;
/** Environment irradiance on upward ground per unit environmentIntensity (the
 * dusk HDR; an estimate, checked by comparing the pixel-art lit fraction with
 * a render whose pool lights are off), for the pixel-art lamp-pool reference. */
const GROUND_ENVIRONMENT = new THREE.Color(0.5, 0.45, 0.62);
/** Lit night windows, shopfront glow and backlit shop signs (R3 night value):
 * the share of existing window room backs lit (upper floors, ground-floor shop
 * windows), their emissive gain and cool (TV-blue, lavender) share, the
 * shopfront diffuser gain and the sign backlight, at night, dusk and sunrise.
 * Most at night, few toward sunrise (the city switching off). */
const WINDOW_LIGHTS = {
  // Refine round 4: more rooms lit, as the cutscene-style repaints of every course light them (the frames' warm-lit
  // share above the road measured 55-80% of theirs).
  night: { upper: 0.72, ground: 0.9, gain: 2, cool: 0.12, diffuser: 2.8, signs: 0.45 },
  // Refine round 4: more of the city already lit at dusk, as a cutscene-style repaint of the dusk race paints it. The
  // gains about the night's radiance once the pixel pass's day exposure (1.45) lifts them: brighter, the windows went
  // into the tone map's white shoulder and read cream, where the dusk repaints keep them deep amber.
  dusk: { upper: 0.45, ground: 0.65, gain: 1.15, cool: 0.1, diffuser: 1.9, signs: 0.28 },
  // Refine round 4: the cutscene-style sunrise repaints keep many rooms lit, warm against the cool morning walls.
  sunrise: { upper: 0.5, ground: 0.75, gain: 0.95, cool: 0.05, diffuser: 1, signs: 0 },
} as const;
const windowLights = (key: keyof typeof WINDOW_LIGHTS.night, dusk: number, morning: number) => THREE.MathUtils.lerp(
  THREE.MathUtils.lerp(WINDOW_LIGHTS.night[key], WINDOW_LIGHTS.dusk[key], dusk), WINDOW_LIGHTS.sunrise[key], morning);
/** The period city's signs are internally lit acrylic, brighter than the
 * classic enamel boards' backlight (WINDOW_LIGHTS signs). */
const PERIOD_SIGN_GAIN = 2.4;
/**
 * Shop fronts as wet-ground column emitters (pixel art): at most this many of the nearest, their warm light, its gain
 * against a street-lamp lens, the shop front's width (m) and the widest column (art cells).
 */
const SHOP_COLUMNS = 4, SHOP_COLUMN_COLOUR = new THREE.Color(1, .66, .36), SHOP_COLUMN_GAIN = .5, SHOP_COLUMN_WIDTH = 2.8, SHOP_COLUMN_CELLS = 16;
/** Shops nearer the camera than this along its view (m) stand beside it, their pavement out of view. */
const SHOP_COLUMN_AHEAD = 9;
/**
 * Shop fronts may take every emitter slot the lamps leave free, up to this many (refine round 4: on Hakone's and
 * Yokohama's streets, with fewer lamps, the road carried about half the warm reflected light of their cutscene-style
 * repaints).
 */
const SHOP_COLUMNS_MAX = 8;
/** A street lamp head's far light (period-city/far-lights.ts): linear HDR sodium gold, and the head's size (m). */
const LAMP_FAR_LIGHT = new THREE.Color(2.2, 1.25, .4), LAMP_FAR_LIGHT_SIZE = .55;
/** Its bulbs, lanterns and canopy lights toward sunrise. */
const PERIOD_SUNRISE_LAMPS = 0.3;
/** Landmark floodlights per unit of the sign backlight (night .45, dusk .28, sunrise 0). */
const PERIOD_FLOODLIGHTS = 1.1;
/** Night canopies (R3 night value): the mature trees' leaves take this much
 * more of the environment's sky light at night (1 by day), so they read as
 * dark teal crowns with structure instead of featureless black masses. Only
 * the foliage: facades keep their light (no lavender wash). */
const NIGHT_FOLIAGE_ENVIRONMENT = 2.2;
/** Rate of the weather transition (1/s); about 95% within two seconds. */
const WEATHER_RATE = 1.5;
/** Key light offset from its target: world-fixed azimuth, ~20 deg dusk
 * elevation. Its length keeps the shadow camera's near/far range. Before
 * Tokyo's final chapter the key swings through the east and down to ~8 deg,
 * then rises ~3 deg with the painted sun; the sunrise azimuth sits ahead-right
 * of the final chapter's route so the sun can enter the chase view. */
const KEY_DISTANCE = Math.hypot(52, 24, 38);
const KEY_AZIMUTH = Math.atan2(-38, -52);
const KEY_ELEVATION = Math.asin(24 / KEY_DISTANCE);
const SUNRISE_AZIMUTH = Math.atan2(0.99, -0.12);
const SUNRISE_ELEVATION = 0.14;
/** The painted sun of a late-day street route (rad): on the horizon at the vanishing point, as every cutscene-style
 * repaint of those routes sets it (at SUNRISE_ELEVATION it stood 9-11 degrees up, behind the roadside crowns). The key
 * light keeps SUNRISE_ELEVATION, so the road keeps its golden light. */
const LOW_SUN_ELEVATION = 0.03;
/** How much of the lamp pools' direct light a soaked road loses at night (road finish pool dim). */
const NIGHT_ROAD_POOL_DIM = 0.8;
/** How much of the direct light and of the ambient a damp road loses at dusk (road finish pool and ambient dims). */
const DUSK_ROAD_DIM = 0.8, DUSK_ROAD_AMBIENT_DIM = 0.7;
/** Shortest signed turn from the dusk key to the sunrise (through the east). */
const SUNRISE_TURN = Math.atan2(Math.sin(SUNRISE_AZIMUTH - KEY_AZIMUTH), Math.cos(SUNRISE_AZIMUTH - KEY_AZIMUTH));
/** Equirect azimuth of the dusk HDR's warm sunset band (u ~0.61). Rotating
 * the environment by this minus the key azimuth keeps the warm band behind
 * the key light, so IBL and car reflections agree with the warm key. */
const HDR_WARM_BAND_ANGLE = (0.61 - 0.5) * TAU;
const MOOD = {
  fillSky: new THREE.Color('#a597c4'), fillGround: new THREE.Color('#3b2d27'),
  // A late-day route's golden hours: warm sky and bounce.
  fillGolden: new THREE.Color('#e8b07e'), fillGoldenGround: new THREE.Color('#6e4a2c'),
  fogNightDry: new THREE.Color('#3a2a4a'), fogDuskDry: new THREE.Color('#8a6a86'),
  fogNightWet: new THREE.Color('#352c4a'), fogDuskWet: new THREE.Color('#7a6a88'),
  // Under the Neutral tone map the dusk key reproduces the cutscenes' sunlit
  // white (#ecbd93, beige-peach) on white paint; oranger keys turn asphalt brown.
  keyMoon: new THREE.Color('#b3a6d9'), keyDusk: new THREE.Color('#ffcf98'),
  keySunrise: new THREE.Color('#ffbf80'), keyWet: new THREE.Color('#f0c49a'),
};
/**
 * A course's cutscene mood (approved by the user: one per Arcade track).
 * Data only: every value feeds the daylight machinery Tokyo's chapters use
 * (key colour and swing, painted sun, sky keyframes, fog, wet road).
 */
interface RaceMood extends RacingSkyMood {
  /** Fixed daylight (0 night, .45 dusk, 1 sunrise); null follows Tokyo's chapter clock. */
  readonly daylight: number | null;
  /** Signed turn (rad) from the dusk key azimuth to the sunrise the key swings to. */
  readonly sunTurn: number;
  /** Road wetness when dry, before the sunrise drying. */
  readonly damp: number;
  /** Street-lamp pools: colour, intensity (cd) and cone. */
  readonly lamp: THREE.Color;
  readonly lampIntensity: number;
  readonly lampCone: { readonly angle: number; readonly penumbra: number; readonly distance: number };
  /** A late-day street route's painted sun sets on the horizon (LOW_SUN_ELEVATION) as the key swings to it. */
  readonly lowSun?: boolean;
  /** Its painted sun's height (rad) where the horizon ahead stands higher (Nara's eastern hills); LOW_SUN_ELEVATION otherwise. */
  readonly lowSunElevation?: number;
  /** A street route's share of upper and ground-floor windows lit at dusk (its repaints light nearly every one); absent: WINDOW_LIGHTS. */
  readonly windows?: number;
}
const sunTurn = (azimuth: number) => Math.atan2(Math.sin(azimuth - KEY_AZIMUTH), Math.cos(azimuth - KEY_AZIMUTH));
/** Arcade track index -> mood. */
const ARCADE_MOODS: readonly RaceMood[] = [
  // 0 Midnight Circuit, Hakone: radio-wide / beat-blackout night. Violet-indigo
  // sky with stars; the weak lavender moon leaves the amber lamps in charge.
  { daylight: 0, night: 'mountain', stars: 0.75, sunTurn: SUNRISE_TURN, damp: 0.6,
    lamp: new THREE.Color('#ffb065'), lampIntensity: 620, lampCone: LAMP_POOL },
  // 1 Harbor Run, Yokohama: harbor-wide night. Dark navy-plum sky, sodium
  // lamps and the wettest ground of the three.
  { daylight: 0, night: 'harbor', stars: 0.8, sunTurn: SUNRISE_TURN, damp: 0.85,
    lamp: new THREE.Color('#ffa24c'), lampIntensity: 520, lampCone: LAMP_POOL_HARBOR },
  // 2 Sakura Pass, Nikko: sunrise-wide. Peach and amber sky with the flat
  // cream disc ahead-left of the first climb (it stays in the chase view for
  // much of the lap), a low warm key with long shadows, and a drier road.
  { daylight: 1, night: 'mountain', stars: 0, sunTurn: sunTurn(2.09), damp: 0.45,
    lamp: new THREE.Color('#ffb468'), lampIntensity: 620, lampCone: LAMP_POOL },
];
/** Tokyo keeps its five-chapter night -> dusk -> sunrise progression. */
const TOKYO_MOOD: RaceMood = { daylight: null, night: 'city', stars: 1.5, sunTurn: SUNRISE_TURN, damp: DAMP_ROAD_WETNESS,
  lamp: new THREE.Color('#ffb065'), lampIntensity: 620, lampCone: LAMP_POOL };
const worlds = new WeakMap<HTMLCanvasElement, RaceWorld | null>();
const arcCourses = new Map<number, Course>();
const streetCourses = new WeakMap<CompiledStreetTrack, Course>();
const streetscapes = new WeakMap<Course, StreetscapeLayout>();
const cityLayouts = new WeakMap<Course, CityBlockLayout>();
const cityPlotLayouts = new WeakMap<Course, CityPlotLayout>();
const cityGardenLayouts = new WeakMap<Course, CityGardenLayout>();

/** The route sector at a progress on a street course. */
function sectorsFor(course: Course): (p: number) => number {
  const samples = (course.key as CompiledStreetTrack).samples;
  return p => {
    const mm = modulo(p, course.length) * 1000;
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (samples[mid]!.progressMm <= mm) lo = mid; else hi = mid - 1; }
    return samples[lo]!.sector;
  };
}
/** The period city's district on each side of a street course, by route sector. */
function districtsFor(course: Course): (p: number, side: -1 | 1) => PeriodDistrict {
  const table = sceneFor(course)?.districts;
  if (!table) return () => 'kanda';
  const sector = sectorsFor(course);
  return (p, side) => {
    const row = table[sector(p)] ?? table[0]!;
    return side < 0 ? row.right : row.left;
  };
}
/** A street route's own people and animals, by route sector (street-scenes.ts `locals`). */
function localsFor(course: Course): (p: number) => PeriodLocals | null {
  const locals = sceneFor(course)?.locals;
  if (!locals?.length) return () => null;
  const sector = sectorsFor(course);
  return p => { const s = sector(p); return locals.find(local => local.sectors.includes(s)) ?? null; };
}
/** A street course's dressing; Arcade courses (numeric keys) have none. */
function sceneFor(course: Course): StreetScene | undefined {
  return typeof course.key === 'number' ? undefined : streetScene((course.key as CompiledStreetTrack).id);
}
const sceneMoods = new WeakMap<StreetScene, RaceMood>();
/** The light for a street route at a tick: Tokyo's chapter arc, or the route's own daylight keys. */
function streetLight(track: CompiledStreetTrack, tick: number): { readonly mood: RaceMood; readonly daylight: number } | null {
  const scene = streetScene(track.id); if (!scene) return null;
  const chapter = streetPresentation(track, tick), keys = scene.mood.daylight;
  if (keys === 'dawn-arc') return { mood: TOKYO_MOOD, daylight: THREE.MathUtils.smoothstep(chapter.dawn, 0, 1) };
  let mood = sceneMoods.get(scene);
  if (!mood) {
    mood = { daylight: null, night: scene.mood.night, stars: scene.mood.stars,
      sunTurn: scene.mood.sun === undefined ? SUNRISE_TURN : sunTurn((scene.mood.sun + 90) * Math.PI / 180), lowSun: scene.mood.sun !== undefined,
      lowSunElevation: scene.mood.sunHeight === undefined ? undefined : scene.mood.sunHeight * Math.PI / 180,
      windows: scene.mood.windows,
      damp: scene.mood.damp,
      lamp: new THREE.Color(scene.mood.lamp), lampIntensity: 620, lampCone: LAMP_POOL };
    sceneMoods.set(scene, mood);
  }
  const from = keys[Math.min(chapter.index, keys.length - 1)] ?? 0, to = keys[Math.min(chapter.index + 1, keys.length - 1)] ?? from;
  return { mood, daylight: from + (to - from) * chapter.progress };
}

/** Presentation geometry only. RaceV1's frozen progress and collision arithmetic is unchanged. */
function arcadeCourse(id: number): Course {
  const cached = arcCourses.get(id); if (cached) return cached;
  const track = TRACKS[id]!, poses: Pose[] = [];
  let x = 0, z = -100, heading = 0;
  for (let p = -100; p <= track.length / 1000 * 3 + 500; p += 5) {
    poses.push({ x, y: 0, z, heading, width: 6, p });
    heading -= curvature(track, Math.max(0, p * 1000)) * 5 / 760;
    x += Math.sin(heading) * 5; z += Math.cos(heading) * 5;
  }
  const course = { key: id, length: track.length / 1000 * 3, circuit: false, poses, style: id };
  arcCourses.set(id, course); return course;
}
function streetCourse(track: CompiledStreetTrack): Course {
  const cached = streetCourses.get(track); if (cached) return cached;
  const course = { key: track, length: track.lengthMm / 1000, circuit: track.topology === 'circuit', style: streetScene(track.id)?.style ?? 3,
    poses: track.samples.map(s => ({ p: s.progressMm / 1000, x: -s.eastMm / 1000, y: s.elevationMm / 1000,
      z: s.northMm / 1000, heading: -s.headingMicroturn * TAU / 1e6, width: s.halfWidthMm / 1000 })) };
  streetCourses.set(track, course); return course;
}
function poseAt(course: Course, progress: number): Pose {
  const p = course.circuit ? modulo(progress, course.length) : clamp(progress, course.poses[0]!.p, course.poses.at(-1)!.p);
  let lo = 0, hi = course.poses.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (course.poses[mid]!.p <= p) lo = mid; else hi = mid; }
  const a = course.poses[lo]!, b = course.poses[hi]!, t = (p - a.p) / (b.p - a.p || 1);
  return { p, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    heading: a.heading + (b.heading - a.heading) * t, width: a.width + (b.width - a.width) * t };
}
function point(p: Pose, lateral: number, up = 0, forward = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x + Math.cos(p.heading) * lateral + Math.sin(p.heading) * forward,
    p.y + up, p.z - Math.sin(p.heading) * lateral + Math.cos(p.heading) * forward);
}

/** One WebGL scene per shared display canvas; both driving modes use the same real 3D assets. */
export class RaceWorld {
  readonly canvas = document.createElement('canvas');
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.12, 600);
  readonly pass;
  /** Hand-drawn pixel-art renderer (docs/pixel-art-renderer.md). */
  readonly pixelArt;
  private readonly localCarReflections;
  private readonly paintedSky = createPaintedSky();
  // With Pixel finish on, both Arcade and Tokyo use the pixel-art renderer.
  // Comparison routes keep the earlier finishes: ?render=regions (display-
  // resolution regions), ?render=grouped (regions plus analytic light planes)
  // and ?render=cinematic (legacy 2x2 sampling). Pixel finish off is clean.
  private readonly renderingMode = new URLSearchParams(window.location.search).get('render');
  private readonly regionRoute = this.renderingMode === 'regions' || this.renderingMode === 'grouped';
  private groupedVisuals = false;
  private pixelArtActive = false;
  /** Camera view of the last pixel-art frame; a change is a cut that resets its temporal history. */
  private pixelArtView: string | null = null;
  private readonly groupedLighting = this.renderingMode === 'grouped' ? createClusteredLighting() : null;
  readonly effects;
  readonly flag: THREE.Texture;
  readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly roadFinish: RoadFinish;
  readonly keyLight = new THREE.DirectionalLight(MOOD.keyDusk, 1.3);
  readonly fill = new THREE.HemisphereLight(MOOD.fillSky, MOOD.fillGround, 0.14);
  readonly road = new THREE.Group();
  readonly cars: CarModel[] = [];
  readonly buildings: THREE.Group[] = [];
  readonly trees: THREE.Group[] = [];
  readonly forest: THREE.Group[] = [];
  readonly woodland: THREE.Group[] = [];
  /** Cherry trees for Nikko's Sakura Pass and Chidorigafuchi (procedural blossom crowns). */
  readonly sakura: THREE.Group[] = [];
  private readonly blossom: THREE.MeshStandardMaterial;
  /** The crowns' tones (the first is `blossom`): one cherry pink, or autumn maple's crimson, orange and gold. */
  private readonly blossomTones: THREE.MeshStandardMaterial[];
  private momiji = false;
  /** Chidorigafuchi's progress range on Tokyo (route sector 2), where the cherries stand. */
  private sakuraRange: readonly [number, number] | null = null;
  /** A switchback route's single hillside, which also places its trees. */
  private slope: SlopeTerrain | null = null;
  private treeBatch?: TreeBatch;
  /** The mature trees' shared leaf materials (night canopy light). */
  private readonly foliageMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly vehicleAmbient = new VehicleAmbientOcclusion();
  private readonly architectureAmbient = new ArchitectureAmbient();
  private groundTextures: THREE.Texture[] = [];
  lightingTarget?: THREE.WebGLRenderTarget;
  readonly apartments: THREE.Group[] = [];
  readonly lamps: THREE.Group[] = [];
  private readonly lightPools: THREE.SpotLight[] = [];
  private readonly shopLights: THREE.SpotLight[] = [];
  private readonly shopAreaLights: THREE.RectAreaLight[] = [];
  private readonly shopAreaLightSlots: ShopAreaLightSlot[] = [{ fixtureId: null, gain: 0 }, { fixtureId: null, gain: 0 }];
  /** Luminance of the two nearest visible shop tubes; zero disables the study. */
  shopAreaLightLuminance = 65;
  private readonly headlights: THREE.SpotLight[] = [];
  /** Lamp heads handed to the pixel-art ground stage each frame (reused). */
  private readonly groundEmitters: GroundEmitter[] = Array.from({ length: MAX_GROUND_EMITTERS },
    () => ({ position: new THREE.Vector3(), groundY: 0, color: new THREE.Color(), intensity: 0, width: LAMP_LENS.width }));
  private readonly groundAmbient = new THREE.Color();
  /** Oil slicks handed to the pixel-art ground stage each frame (reused). */
  private readonly groundHazards: GroundHazard[] = Array.from({ length: MAX_HAZARDS },
    () => ({ x: 0, z: 0, heading: 0, halfWidth: 0, halfLength: 0 }));
  private detailedHazardTree: ((seed: number) => THREE.Group) | null = null;
  private understory: UnderstoryField | null = null;
  readonly hazards = new Map<string, THREE.Object3D>();
  readonly fog = new THREE.FogExp2('#797087', 0.0048);
  readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private course: Course | null = null;
  private streetscape?: StreetscapeLayout;
  private cityLayout?: CityBlockLayout;
  private cityBatch?: CityBlockBatch;
  private cityPlotLayout?: CityPlotLayout;
  private readonly cityPlotBatch: CityPlotBatch;
  private cityGardenLayout?: CityGardenLayout;
  private readonly cityGardenBatch: CityGardenBatch;
  private cityGround?: (x: number, z: number) => number | null;
  /** The procedural 1986 city on street courses (docs/period-city.md);
   * ?city=classic keeps the earlier template city for comparison. */
  private readonly periodCity: PeriodCity;
  private readonly classicCity = new URLSearchParams(window.location.search).get('city') === 'classic';
  private readonly cityFixtures: CityFixture[] = [];
  private periodDistrictAt: ((p: number, side: -1 | 1) => PeriodDistrict) | null = null;
  /** Whether every pooled material (trees, understory, cars) has been compiled for this course. */
  private shadersWarmed = false;
  private sceneryCell = NaN;
  private lastTime = 0;
  private lastProgress = NaN;
  private speedEnvelope = 0;
  private boostEnvelope = 0;
  /** Smoothed rain state (0 dry, 1 raining) for the road, key and fog. */
  private weather = 0;
  private readonly keyDirection = new THREE.Vector3();
  private readonly paintedSun = new THREE.Vector3();
  /** The night ceiling on the lamps' direct light on the cherry crowns (capDirectDiffuse). */
  private readonly blossomDirectCap = { value: BLOSSOM_DIRECT_CAP };
  /** The night ceiling on the lamps' direct light on the street trees' leaves (capDirectDiffuse). */
  private readonly foliageDirectCap = { value: DAY_DIRECT_CAP };
  /** The night ceiling on the lamps' direct light on the street trees' trunks and branches (capDirectDiffuse). */
  private readonly barkDirectCap = { value: DAY_DIRECT_CAP };
  /** While the crowns are autumn maples, by day: how much of the painted crown light they take (mapleCrownLight). */
  private readonly mapleLight = { value: 0 };
  /** Street lamps: the pool (20 a side) and their spacing (m). */
  private readonly lampPool = 40;
  private readonly lampSpacing = 22;
  /** This frame's road-finish pool dim (the share of the road's direct light taken off). */
  private roadPoolDim = 0;
  /** This frame's road-finish ambient dim. */
  private roadAmbientDim = 0;
  private readonly scratchColor = new THREE.Color();
  private readonly scratch = new THREE.Object3D();
  /** Wet-road reflections of the cars' tail lamps. */
  private readonly tailStreaks = new TailStreaks();
  /** The street lamps' heads as glowing points down the street (period-city/far-lights.ts). */
  private readonly lampFarLights = new MovingFarLights(40);
  private readonly lampHead = new THREE.Vector3();
  /** The nearest lamp heads, whose spill washes the period city's facades (period-city/materials.ts). */
  private readonly washHeads = Array.from({ length: 6 }, () => new THREE.Vector3());
  private readonly cameraAhead = new THREE.Vector3();
  private readonly scratchVector = new THREE.Vector3();
  /** The road's wetness last frame (umbrellas open on wet nights). */
  private lastRoadWetness = 0;
  /** Backing size and scene supersample of the last pixel-art grid (sky star cells). */
  private artGridWidth = 0;
  private artGridHeight = 0;
  private artGridSupersample = 2;
  private readonly posts: THREE.InstancedMesh;
  private readonly rails: THREE.InstancedMesh;

  constructor(private readonly output: HTMLCanvasElement) {
    RectAreaLightUniformsLib.init();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
    installSpotlightEarlyOut(this.renderer);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = RACE_TONE_MAPPING;
    this.renderer.toneMappingExposure = RACE_TONE_MAPPING_EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.pass = createCinematicPass(this.renderer);
    this.pixelArt = createPixelArtPass(this.renderer);
    this.localCarReflections = createLocalCarReflections(this.renderer);
    this.groupedVisuals = this.regionRoute && getPixelFinish();
    this.pass.setPaintedPixelGroups(this.groupedVisuals);
    this.groupedLighting?.configure({
      strength: this.groupedVisuals ? 1 : 0,
      diffuseBands: 1, specularStrength: 0, shadeTint: .35,
    });
    this.effects = createDrivingEffects(this.scene);
    const loader = new THREE.TextureLoader();
    this.flag = loader.load(asset('sora-flag.png')); this.flag.colorSpace = THREE.SRGBColorSpace;
    this.periodCity = new PeriodCity(asset('branding/sora-emblem-source.png'), asset('sprites/street-people.png'), asset('sprites/window-interiors.png'));
    this.scene.add(this.periodCity.group);
    this.scene.add(this.tailStreaks.mesh, this.lampFarLights.points);
    this.roadMaterial = new THREE.MeshStandardMaterial({ ...scannedSurface('asphalt_02'), normalScale: new THREE.Vector2(0.55, 0.55), color: ROAD_ALBEDO, roughness: 0.88, metalness: 0 });
    this.vehicleAmbient.decorate(this.roadMaterial);
    this.roadFinish = decorateRoadFinish(this.roadMaterial);
    this.scene.background = new THREE.Color('#202449');
    output.dataset.lightingAsset = 'loading';
    new HDRLoader().load(asset('lighting/qwantani-dusk.hdr'), texture => {
      this.lightingTarget = createDuskEnvironment(this.renderer, texture);
      texture.dispose();
      this.scene.environment = this.lightingTarget.texture; this.scene.environmentIntensity = 0.36;
      this.scene.background = this.lightingTarget.texture; this.scene.backgroundIntensity = 0.12;
      // draw() keeps the HDR's warm band behind the key light every frame.
      this.scene.backgroundRotation.y = this.scene.environmentRotation.y = HDR_WARM_BAND_ANGLE - KEY_AZIMUTH;
      output.dataset.lightingAsset = 'detailed';
    }, undefined, error => { output.dataset.lightingAsset = 'failed'; console.error('Dusk lighting failed to load.', error); });
    this.scene.fog = this.fog;
    this.scene.add(this.fill, this.keyLight, this.keyLight.target, this.road);
    // The procedural cloud field is a visible, direction-anchored sky only.
    // Keep local car reflection probes on layer 0 so their HDR radiance still
    // comes from the scene environment rather than this display sky.
    this.paintedSky.mesh.layers.set(1);
    this.camera.layers.enable(1);
    this.paintedSky.setEnabled(true);
    // Shade only uncovered pixels: the sky draws after the opaque scene.
    this.paintedSky.setDepthOccluded(true);
    this.paintedSky.setOutputToneMapping(RACE_TONE_MAPPING, RACE_TONE_MAPPING_EXPOSURE);
    this.scene.add(this.paintedSky.mesh);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1536, 1536);
    Object.assign(this.keyLight.shadow.camera, { left: -48, right: 48, top: 60, bottom: -36, near: 1, far: 190 });
    this.keyLight.shadow.bias = -0.0005; this.keyLight.shadow.normalBias = 0.035;
    for (let i = 0; i < 8; i++) { const car = createCarModel(LIVERIES[i % 6]!.color, this.flag); this.cars.push(car); this.scene.add(car.group); }
    this.pixelArt.setMovers(this.cars.map(model => model.group));
    for (let i = 0; i < 48; i++) { const b = createBuilding(i, this.flag); this.buildings.push(b); this.scene.add(b); }
    for (let i = 0; i < 20; i++) { const b = createApartment(i); this.apartments.push(b); this.scene.add(b); b.visible = false; }
    const plotMaterials = {
      paving: new THREE.MeshStandardMaterial({ ...scannedSurface('concrete_pavement_03'), normalScale: new THREE.Vector2(.45, .45), roughness: 1 }),
      stone: new THREE.MeshStandardMaterial({ ...scannedSurface('japanese_stone_wall'), color: '#b1ada2', normalScale: new THREE.Vector2(.65, .65), roughness: .97 }),
      coping: new THREE.MeshStandardMaterial({ ...scannedSurface('grey_plaster_03'), color: '#aaa9a3', normalScale: new THREE.Vector2(.25, .25), roughness: .92 }),
    };
    Object.values(plotMaterials).forEach(material => this.vehicleAmbient.decorate(material));
    this.cityPlotBatch = new CityPlotBatch(plotMaterials); this.scene.add(this.cityPlotBatch.group);
    const gardenMaterials = {
      clay: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78,
        normalMap: scannedSurface('beige_wall_001').normalMap, normalScale: new THREE.Vector2(.18, .18) }),
      concrete: new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('concrete_pavement_03'), roughness: .96 }),
      soil: new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('forest_ground_04'), roughness: 1 }),
      foliage: new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .55, clearcoat: .12, clearcoatRoughness: .35 }),
      wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }),
    };
    this.cityGardenBatch = new CityGardenBatch(gardenMaterials); this.scene.add(this.cityGardenBatch.group);
    for (let i = 0; i < 40; i++) { const t = createTree(i % 2, i % 2 === 0); this.trees.push(t); this.scene.add(t); }
    // 20 a side (refine round 4): the autumn routes' maples stand 8 m apart in two rows (see the population below).
    for (let i = 0; i < 40; i++) { const t = createTree(i + 300, true); t.visible = false; this.sakura.push(t); this.scene.add(t); }
    // Blossom, not leaf: pale pink without the leaf texture, glowing softly as
    // lit night cherries (夜桜) and as petals backlit by the sunrise.
    this.blossom = new THREE.MeshStandardMaterial({ color: '#ffe1ea', vertexColors: true, roughness: .85,
      emissive: '#f2a9c4', emissiveIntensity: 0 });
    this.blossom.name = 'Sakura blossom';
    // Refine round 4: a lamp's pool light on the crowns beside it stays under a ceiling (scene-linear luminance of the
    // direct diffuse), so a night cherry is lit pink-white, not blown out brighter than the lit windows; the wet road
    // mirrored the blown-out crown as a broad pale bar where the cutscene-style repaints have the lamp's thin streak.
    const directCap = this.blossomDirectCap;
    this.blossom.userData.directCap = directCap;
    capDirectDiffuse(this.blossom, directCap, 'sora-blossom-cap-v2');
    // Refine round 4 (the street routes' cutscene-style repaints): autumn maples spread from crimson through orange to
    // gold tree by tree; one orange over every crown read salmon. Cherries share one pink.
    this.blossomTones = [this.blossom, ...MAPLE_TONES.slice(1).map(() => this.blossom.clone())];
    this.blossomTones.forEach((tone, i) => {
      if (i) {
        tone.name = `Sakura blossom ${i + 1}`; tone.userData.directCap = directCap;
        capDirectDiffuse(tone, directCap, 'sora-blossom-cap-v2');
      }
      mapleCrownLight(tone, this.mapleLight);
    });
    this.sakura.forEach((tree, i) => tree.traverse(object => {
      if (object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.vertexColors)
        object.material = this.blossomTones[(i * 7) % this.blossomTones.length]!;
    }));
    // Refine round 4: street lamps every 22 m (they stood 43 m apart, then 26), as the cutscene-style repaints of every
    // course line their roads; 20 a side keeps the row's reach. Against seven repaints 22 m scored best (mean gap 0.259,
    // 26 m 0.275, 18 m 0.271); scene by scene it swings either way with where the lamps fall.
    for (let i = 0; i < this.lampPool; i++) { const lamp = createStreetLamp(); this.lamps.push(lamp); this.scene.add(lamp); }
    const railMaterial = new THREE.MeshStandardMaterial({ color: '#727b80', roughness: 0.55, metalness: 0.65 });
    this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.85, 0.13), railMaterial, 200);
    this.rails = new THREE.InstancedMesh(guardrailGeometry(), railMaterial, 200);
    this.posts.castShadow = this.rails.castShadow = true;
    this.posts.receiveShadow = this.rails.receiveShadow = true;
    this.posts.frustumCulled = this.rails.frustumCulled = false;
    this.scene.add(this.posts, this.rails);
    // Amber sodium-style pools (colour and intensity follow the mood). A soft
    // penumbra keeps a bright centre and dark asphalt between lamps, while the
    // outer cone still reaches the mirror points of lamps ~20 m away; the
    // pixel-art pass adds screen-space columns for farther lamp heads.
    for (let i = 0; i < 6; i++) {
      const light = new THREE.SpotLight('#ffb468', 480, LAMP_POOL.distance, LAMP_POOL.angle, LAMP_POOL.penumbra, 2);
      this.lightPools.push(light); this.scene.add(light, light.target);
    }
    for (let i = 0; i < 5; i++) {
      const light = new THREE.SpotLight('#ffb870', 170, 12, 0.96, 0.8, 2);
      this.shopLights.push(light); this.scene.add(light, light.target);
    }
    // The existing 1.72 m twin tubes are visible geometry. Their small,
    // road-facing radiance can form shaped reflections in car clearcoat using
    // Three's LTC area-light BRDF, without a texture or another scene render.
    for (let i = 0; i < 2; i++) {
      const light = new THREE.RectAreaLight('#ffd29a', 0, 1.72, 0.14);
      light.name = `SORA shop fluorescent area light ${i + 1}`;
      this.shopAreaLights.push(light); this.scene.add(light);
    }
    for (let i = 0; i < 2; i++) {
      const light = new THREE.SpotLight('#ffedc3', 18, 32, 0.35, 0.7, 2);
      this.headlights.push(light); this.scene.add(light, light.target);
    }
    // Their pools become lit-ground flecks in the pixel-art renderer.
    this.pixelArt.setPoolLights([...this.lightPools, ...this.shopLights, ...this.headlights]);
    output.dataset.renderer = 'webgl-3d'; output.dataset.carAsset = 'loading';
    output.dataset.sceneryAsset = 'loading';
    output.dataset.understoryAsset = 'loading';
    void createUnderstory({ maxPlants: 7000 }).then(field => {
      this.understory = field; this.scene.add(field.group); this.sceneryCell = NaN;
      output.dataset.understoryAsset = 'detailed';
    }).catch(error => { output.dataset.understoryAsset = 'failed'; console.error('Forest understory failed to load.', error); });
    void Promise.all([loadDetailedScenery(), loadShopProps(), scannedSurfacesReady(),
      this.architectureAmbient.apply([...this.buildings, ...this.apartments])]).then(async ([assets, props]) => {
      this.trees.forEach((tree, i) => {
        const pine = assets.createMatureTree(i);
        pine.position.copy(tree.position); pine.rotation.copy(tree.rotation);
        pine.visible = tree.visible; pine.userData = { ...pine.userData, ...tree.userData };
        this.scene.remove(tree); this.scene.add(pine); this.trees[i] = pine;
      });
      for (let i = 0; i < 112; i++) { const tree = assets.createMatureTree(i + 40); this.forest.push(tree); this.scene.add(tree); }
      for (let i = 0; i < 96; i++) { const tree = assets.createMatureTree(i + 152); this.woodland.push(tree); this.scene.add(tree); }
      this.treeBatch = new TreeBatch([...this.trees, ...this.forest, ...this.woodland]);
      this.trees[0]?.traverse(object => {
        const material = (object as THREE.Mesh).material;
        if (material instanceof THREE.MeshStandardMaterial && /leaves/i.test(material.name)
          && !this.foliageMaterials.includes(material)) {
          this.foliageMaterials.push(material);
          capDirectDiffuse(material, this.foliageDirectCap, 'sora-foliage-cap-v2', true);
          material.needsUpdate = true;
        } else if (material instanceof THREE.MeshStandardMaterial && /trunk|branches/i.test(material.name) && !material.userData.soraBarkCap) {
          material.userData.soraBarkCap = true;
          capDirectDiffuse(material, this.barkDirectCap, 'sora-bark-cap-v1', true);
          material.needsUpdate = true;
        }
      });
      this.scene.add(this.treeBatch.group);
      this.detailedHazardTree = assets.createHazardTree;
      for (const [id, old] of this.hazards) {
        if (old.userData.raceHazardKind !== 'tree') continue;
        const tree = assets.createHazardTree(id.length);
        tree.position.copy(old.position); tree.rotation.copy(old.rotation); tree.visible = old.visible;
        tree.userData.raceHazardKind = 'tree'; this.scene.remove(old); this.scene.add(tree); this.hazards.set(id, tree);
      }
      this.buildings.forEach((building, index) => {
        if (building.userData.openGarage) {
          const workshop = props.create('workshop'); workshop.position.fromArray(building.userData.workshopPosition); building.add(workshop);
          const vending = props.create('vending'); vending.position.fromArray(building.userData.vendingPosition); building.add(vending);
        } else {
          const shutter = assets.createShutter(); shutter.position.fromArray(building.userData.shutterPosition);
          shutter.scale.fromArray(building.userData.shutterScale); building.add(shutter);
        }
        const pipes = assets.createPipes(); pipes.position.fromArray(building.userData.pipesPosition);
        pipes.scale.fromArray(building.userData.pipesScale); building.add(pipes);
        attachShopfront(building, index % 4, this.flag);
      });
      await shopfrontReady();
      this.cityBatch = new CityBlockBatch({ buildings: this.buildings.slice(0, 4), apartments: this.apartments.slice(0, 2) });
      this.scene.add(this.cityBatch.group);
      this.prepareCityBlocks();
      this.sceneryCell = NaN;
      output.dataset.sceneryAsset = 'detailed';
    }).catch(error => { output.dataset.sceneryAsset = 'failed'; console.error('Detailed roadside assets failed to load.', error); });
    const emblemUrl = asset('branding/sora-emblem-source.png');
    // A wide white ring round the roof and bonnet emblems, so the exact emblem's red disc reads on a red car's roof
    // seen at the chase camera's low angle (refine round 4; the garage's part viewer keeps the thin ring).
    void loadDetailedCarFleet(this.flag, soraEmblemTexture(emblemUrl, 512, .3), soraStripTexture(emblemUrl)).then(fleet => {
      const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      for (const model of this.cars) {
        this.scene.remove(model.group);
        model.group.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          geometry.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        });
      }
      geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      this.cars.splice(0, this.cars.length, ...fleet);
      for (const model of fleet) this.scene.add(model.group);
      this.pixelArt.setMovers(this.cars.map(model => model.group));
      output.dataset.carAsset = 'detailed';
    }).catch(error => { output.dataset.carAsset = 'failed'; console.error('Detailed vehicle asset failed to load.', error); });
  }

  /** Fixed-state comparison between procedural visible sky and HDR backdrop. */
  setPaintedSkyEnabled(enabled: boolean): void {
    this.paintedSky.setEnabled(enabled);
  }

  renderArcade(state: RaceState, options: RenderOptions, time: number): HTMLCanvasElement {
    const course = arcadeCourse(state.trackId);
    const controls = options.controls ?? 0;
    const cars = state.cars.map((car, i): VisualCar => {
      const appearance = options.appearances?.[i];
      const livery = clubLivery(LIVERIES[options.skins[i] ?? i % 6] ?? LIVERIES[0]!, appearance);
      return { retired: car.dnf || car.finishTick !== null, p: car.progress / 1000, lateral: -car.x / 1000, yaw: clamp(-car.vx / 450, -0.42, 0.42),
        slip: i === options.playerSlot && controls & CONTROL.drift ? clamp(-car.vx / 450, -0.42, 0.42) : 0,
        speed: car.speed * 0.03, color: livery.color, accent: clubItem(appearance?.skin)?.accent,
        aero: appearance?.upgrade === 'club-aero-86', boosting: i === options.playerSlot && !!(controls & CONTROL.boost) && car.energy >= 25 && car.speed > 0,
        braking: i === options.playerSlot && !!(controls & CONTROL.brake), steer: i === options.playerSlot ? ((controls & CONTROL.left ? 1 : 0) - (controls & CONTROL.right ? 1 : 0)) * 0.25 : 0 };
    });
    const env = options.environment ?? environmentAt(state.trackId, Math.round(state.tick));
    const hazards = env.objects.map(o => ({ id: `arc-${o.id}`, kind: o.kind, p: o.progress / 1000, lateral: -o.x / 1000,
      halfWidth: o.halfWidth / 1000, halfLength: o.halfLength / 1000, broken: false }));
    this.draw(course, cars, options.playerSlot, options.camera ?? 'chase', hazards, env.rain > 0, time);
    return this.canvas;
  }

  renderStreet(track: CompiledStreetTrack, state: StreetRenderState, options: StreetRenderOptions, time: number): HTMLCanvasElement {
    const cars = state.cars.map((car, i): VisualCar => ({ retired: car.status !== 0, p: car.progressMm / 1000, lateral: -car.lateralMm / 1000,
      yaw: -car.bodyYawMicroturn * TAU / 1e6, slip: (car.velocityYawMicroturn - car.bodyYawMicroturn) * TAU / 1e6, speed: car.speedMmPerTick * 0.03,
      color: LIVERIES[car.skin]?.color ?? LIVERIES[0]!.color, boosting: car.boosting === 1,
      braking: i === options.playerSlot && !!(options.controls & CONTROL.brake),
      steer: clamp((car.velocityYawMicroturn - car.bodyYawMicroturn) * TAU / 1e6, -0.4, 0.4) }));
    const hazards = (options.objects ?? []).map((o, i): Hazard => ({ id: `street-${o.id}`, kind: o.kind === 'oil' ? 'oil' : o.kind === 'tree_planter' ? 'tree' : 'sign',
      p: o.progressMm / 1000, lateral: -o.lateralMm / 1000, halfWidth: o.halfWidthMm / 1000, halfLength: o.halfLengthMm / 1000,
      broken: Math.floor((state.worldBrokenMask ?? 0) / 2 ** i) % 2 === 1 }));
    this.draw(streetCourse(track), cars, options.playerSlot, options.camera ?? 'chase', hazards, (options.rain ?? 0) > 0,
      options.paused ? state.tick / 30 : time, streetLight(track, state.tick));
    return this.canvas;
  }

  private setCourse(course: Course): void {
    if (this.course === course) return;
    this.localCarReflections.invalidate();
    this.effects.reset();
    this.course = course; this.sceneryCell = NaN; this.lastProgress = NaN;
    this.shopAreaLightSlots.forEach(slot => { slot.fixtureId = null; slot.gain = 0; });
    this.shopAreaLights.forEach(light => { light.intensity = 0; });
    this.streetscape = streetscapes.get(course) ?? createStreetscape(course);
    streetscapes.set(course, this.streetscape);
    this.cityLayout = undefined; this.cityGround = undefined; this.cityPlotLayout = undefined; this.cityGardenLayout = undefined;
    this.periodCity.clear(); this.periodDistrictAt = null; this.shadersWarmed = false;
    this.cityBatch?.setPlacements({ buildings: [], apartments: [] });
    this.cityPlotBatch.setPlots(null, { buildings: [], apartments: [] });
    this.cityGardenBatch.setGardens(null, { buildings: [], apartments: [] });
    for (const group of [...this.buildings, ...this.apartments, ...this.trees, ...this.sakura]) delete group.userData.raceSceneryStation;
    this.sakuraRange = null; this.slope = null;
    const scene = sceneFor(course), flowering = scene?.trees;
    if (flowering?.sectors.length) {
      const sector = (course.key as CompiledStreetTrack).samples.filter(s => flowering.sectors.includes(s.sector)).map(s => s.progressMm / 1000);
      if (sector.length) this.sakuraRange = [Math.min(...sector), Math.max(...sector)];
    }
    // The flowering-tree crowns turn from cherry blossom to autumn maple.
    const momiji = flowering?.kind === 'momiji';
    this.momiji = momiji;
    this.blossomTones.forEach((tone, i) => {
      tone.color.set(momiji ? MAPLE_TONES[i]!.color : '#ffe1ea'); tone.emissive.set(momiji ? MAPLE_TONES[i]!.emissive : '#f2a9c4');
    });
    const oldMaterials = new Set<THREE.Material>();
    this.road.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
          if (material !== this.roadMaterial) oldMaterials.add(material);
        }
      }
    });
    oldMaterials.forEach(material => material.dispose()); this.road.clear();
    for (const h of this.hazards.values()) {
      this.scene.remove(h);
      // Oil is unique to the track. Prop groups share their cached asset data.
      if (h instanceof THREE.Mesh) { h.geometry.dispose(); (h.material as THREE.Material).dispose(); }
    }
    this.hazards.clear();
    // Each ribbon uses shared native endpoints. Solid continuous triangles avoid the cracks of screen-space strips.
    const ribbon = (left: (p: Pose) => number, right: (p: Pose) => number, up: number, material: THREE.Material, dashed = false) => {
      const positions: number[] = [], uvs: number[] = [];
      // The asphalt scan covers 3 × 3 metres. Stretching it across 6 × 10
      // metres turns its aggregate and small cracks into oversized road damage.
      const across = material === this.roadMaterial ? 3 : 6;
      const along = material === this.roadMaterial ? 3 : 10;
      for (let i = 0; i < course.poses.length - 1; i++) {
        const a = course.poses[i]!, b = course.poses[i + 1]!;
        if (dashed && Math.floor(a.p / 5) % 2 !== 0) continue;
        const corners = [point(a, left(a), up), point(a, right(a), up), point(b, right(b), up), point(b, left(b), up)];
        const tex = [[left(a) / across, a.p / along], [right(a) / across, a.p / along], [right(b) / across, b.p / along], [left(b) / across, b.p / along]];
        for (const index of [0, 2, 1, 0, 3, 2]) { const v = corners[index]!; positions.push(v.x, v.y, v.z); uvs.push(...tex[index]!); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true; this.road.add(mesh);
    };
    const ground = course.style === 3 ? createUrbanPavingMaterial()
      : new THREE.MeshStandardMaterial({ ...scannedSurface('forest_ground_04'), color: '#a9a2a6', normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1 });
    this.groundTextures = ground.userData.urbanPavingTextures ?? [ground.map, ground.normalMap, ground.roughnessMap];
    const shoulder = new THREE.MeshStandardMaterial({ ...scannedSurface('grey_plaster_03'), color: '#999b9e', roughness: 0.96 });
    const paint = new THREE.MeshStandardMaterial({ color: '#d7cebe', roughness: 0.89 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#c2a368', roughness: 0.86 });
    for (const material of [ground, shoulder, paint, yellow]) this.vehicleAmbient.decorate(material);
    // The gutter strip takes the road's key-specular ceiling (R3 Nikko glare),
    // and so does the moat: a smooth sheet otherwise mirrors the key as one pink band.
    shareSpecularLimits(shoulder, this.roadFinish, true);
    shareSpecularLimits(this.periodCity.water, this.roadFinish);
    if (course.style === 3) {
      // The period city's moats and lawns replace the paved ground beside them.
      const districtAt = districtsFor(course), open = this.classicCity ? [] : periodCityOpenRuns(course, districtAt);
      this.periodDistrictAt = this.classicCity ? null : districtAt;
      const crossings = !this.classicCity ? scene?.crossings ?? [] : [];
      const urbanGround = createUrbanGround(course.poses, ground, periodCityGroundCut(course, open, crossings, scene?.street?.forestBanks));
      this.road.add(urbanGround);
      // Wooded hills on a city route (Iimoriyama, Keage) rise as forest banks;
      // a climb that switches back on itself (Wakakusa-yama) shares one hillside.
      const wooded = (p: number) => districtAt(p, -1) === 'forest' || districtAt(p, 1) === 'forest';
      if (open.some(run => run.district === 'forest') && scene?.terrain === 'slope') {
        // Autumn routes lay leaf drifts over the hillside (terrain.ts), as their repaints carpet every verge.
        this.slope = createSlopeTerrain(course.poses, [], wooded, scene?.trees?.kind === 'momiji' ? 1 : 0); this.road.add(this.slope.group);
      } else if (open.some(run => run.district === 'forest')) this.road.add(createTerrain(course.poses, 2, (p, side) => districtAt(p, side < 0 ? -1 : 1) !== 'forest'));
      this.cityGround = createGroundHeightSampler(urbanGround);
      const track = course.key as CompiledStreetTrack;
      if (!this.classicCity) this.periodCity.setCourse(course, { groundHeightAt: this.cityGround, districtAt, localsAt: localsFor(course), open, crossings,
        landmarks: scene?.landmarks ?? [], street: scene?.street, distant: scene?.distant ?? [], snow: scene?.snow ?? 0,
        signs: scene?.signs ? SIGN_REGIONS[scene.signs] : null,
        origin: scene?.tokyoSkyline ? { lon: track.originE7[0] / 1e7, lat: track.originE7[1] / 1e7 } : undefined });
      this.prepareCityBlocks();
    } else if (this.classicCity) {
      ribbon(() => -110, () => 110, -0.08, ground);
      this.road.add(createTerrain(course.poses, course.style));
    } else {
      // Arcade: onsen towns, Yokohama's quays and Nikko's street stand on the
      // flat strip before the banks rise. The harbour is flat and opens onto
      // the water at its quays; Nikko's gorge cuts across the route.
      // Street routes in a mountain style keep their own districts by sector.
      const districtAt = scene ? districtsFor(course) : (p: number, side: -1 | 1) => arcadeDistrictAt(course.style, p, side);
      const open = periodCityOpenRuns(course, districtAt), crossings = scene ? scene.crossings : ARCADE_1986_CROSSINGS[course.style] ?? [];
      this.periodDistrictAt = districtAt;
      const quay = (p: number, side: -1 | 1) => open.some(run => run.district === 'quay' && run.side === side && p >= run.start - 4 && p <= run.end + 4);
      const gorge = (p: number) => crossings.some(c => Math.abs(p - c.p) < (c.half ?? 12) + 3.5);
      const flat = (p: number, side: number) => gorge(p) || ['harbour', 'quay'].includes(districtAt(p, side < 0 ? -1 : 1));
      const frame = periodCityRouteFrame(course, 120);
      let groundHeightAt = (x: number, z: number) => {
        const at = frame(x, z);
        if (!at || gorge(at.p) || quay(at.p, at.side) && at.beyond > QUAY.edge - .5) return null;
        return at.beyond < 18 || flat(at.p, at.side) ? -0.08 : terrainHeightAt(at.beyond, at.p, at.side);
      };
      if (scene?.terrain === 'slope') {
        // Stacked hairpins share one hillside; the flat strip and banks would roof over the other legs.
        const slope = this.slope = createSlopeTerrain(course.poses, crossings.map(c => {
          const at = poseAt(course, c.p); return { x: at.x, z: at.z, radius: (c.half ?? 12) + 8, depth: 7 };
        }), undefined, scene?.trees?.kind === 'momiji' ? 1 : 0);
        this.road.add(slope.group);
        groundHeightAt = (x, z) => { const at = frame(x, z), h = slope.heightAt(x, z); return !at || gorge(at.p) || !Number.isFinite(h) ? null : h; };
      } else {
        ribbon(p => gorge(p.p) ? -(p.width + 1.7) : quay(p.p, -1) ? -(p.width + QUAY.edge) : -110,
          p => gorge(p.p) ? p.width + 1.7 : quay(p.p, 1) ? p.width + QUAY.edge : 110, -0.08, ground);
        this.road.add(createTerrain(course.poses, course.style, flat));
      }
      this.periodCity.setCourse(course, { groundHeightAt, districtAt, localsAt: scene ? localsFor(course) : undefined, open, crossings,
        landmarks: scene ? scene.landmarks : ARCADE_1986_LANDMARKS[course.style] ?? [],
        street: scene ? scene.street : ARCADE_1986_STREET[course.style],
        distant: scene ? scene.distant : ARCADE_DISTANT[course.style] ?? [], snow: scene ? scene.snow : course.style === 0 ? .9 : 0,
        signs: scene?.signs ? SIGN_REGIONS[scene.signs] : null });
    }
    ribbon(p => -p.width - 1.65, p => p.width + 1.65, -0.015, shoulder);
    ribbon(p => -p.width, p => p.width, 0, this.roadMaterial);
    for (const side of [-1, 1]) {
      ribbon(p => side * p.width * 0.945 - 0.055, p => side * p.width * 0.945 + 0.055, 0.012, paint);
      ribbon(p => side * p.width * 0.48 - 0.045, p => side * p.width * 0.48 + 0.045, 0.013, paint, true);
      ribbon(() => side * 0.08 - 0.028, () => side * 0.08 + 0.028, 0.014, yellow);
    }
    // The period city builds its own lot edges; its Arcade forests and the
    // classic city keep their boundary walls.
    const districts = this.periodDistrictAt;
    const infrastructure = createRoadsideInfrastructure(course.poses, course.style === 3, !this.periodCity.active
      || (course.style !== 3 && !!districts && ((p: number, side: number) => districts(p, side < 0 ? -1 : 1) === 'forest')));
    // Kerbs and sidewalks too: under the low sunrise their rough concrete
    // otherwise scatters one smooth cream glare band along the shoulder,
    // where sunrise-wide's roadside stays diffuse (faint warm speckle).
    infrastructure.traverse(object => {
      if (object instanceof THREE.Mesh && object.name === 'Beveled curb and sidewalk'
        && object.material instanceof THREE.MeshStandardMaterial) shareSpecularLimits(object.material, this.roadFinish, true);
    });
    this.road.add(infrastructure);
  }

  private prepareCityBlocks(): void {
    if (this.course?.style !== 3 || this.periodCity.active || !this.streetscape || !this.cityBatch || !this.cityGround) return;
    this.cityLayout = cityLayouts.get(this.course) ?? createCityBlocks(this.streetscape, this.cityBatch.bounds,
      { groundHeightAt: this.cityGround });
    cityLayouts.set(this.course, this.cityLayout);
    this.cityPlotLayout = cityPlotLayouts.get(this.course) ?? createCityPlots(this.cityLayout, this.streetscape,
      this.cityBatch.bounds, { groundHeightAt: this.cityGround });
    cityPlotLayouts.set(this.course, this.cityPlotLayout);
    this.cityGardenLayout = cityGardenLayouts.get(this.course) ?? createCityGardens(this.cityPlotLayout, { groundHeightAt: this.cityGround });
    cityGardenLayouts.set(this.course, this.cityGardenLayout);
  }

  private placeScenery(course: Course, progress: number): void {
    const cell = Math.floor(progress / 20); if (cell === this.sceneryCell) return; this.sceneryCell = cell;
    const place = (group: THREE.Object3D, p: number, side: number, clearance: number, facing = true) => {
      const at = poseAt(course, p); group.position.copy(point(at, side * (at.width + clearance)));
      group.rotation.y = at.heading + (facing ? side === -1 ? -Math.PI / 2 : Math.PI / 2 : 0);
      group.visible = course.circuit || p >= course.poses[0]!.p && p <= course.poses.at(-1)!.p;
    };
    // Keep shared stations fixed in the world. Only instances that have left
    // the visible window are reassigned to newly arriving stations.
    const populate = (groups: THREE.Group[], spacing: number, behind: number, phase: number,
      update: (group: THREE.Group, station: number, p: number, side: number) => void) => {
      const stationCount = Math.max(1, Math.ceil(course.length / spacing));
      const step = course.circuit ? course.length / stationCount : spacing;
      const position = course.circuit ? modulo(progress, course.length) : progress;
      const start = Math.floor((position - behind) / step);
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const pool = groups.filter((_, i) => i % 2 === sideIndex);
        const count = course.circuit ? Math.min(pool.length, stationCount) : pool.length;
        const stations = Array.from({ length: count }, (_, i) => course.circuit ? modulo(start + i, stationCount) : start + i);
        const wanted = new Set(stations);
        const retained = new Map<number, THREE.Group>();
        const available: THREE.Group[] = [];
        for (const group of pool) {
          const station = group.userData.raceSceneryStation as number | undefined;
          if (station !== undefined && wanted.has(station) && !retained.has(station)) retained.set(station, group);
          else { group.visible = false; available.push(group); }
        }
        for (const station of stations) {
          const group = retained.get(station) ?? available.pop()!;
          group.userData.raceSceneryStation = station;
          update(group, station, station * step + (sideIndex ? phase : 0), sideIndex ? 1 : -1);
        }
      }
    };
    const layout = this.streetscape!, window = selectStreetscape(layout, progress);
    const assign = (pool: THREE.Group[], placements: readonly StreetscapePlacement[], variants: number) => {
      const available = new Set(pool), retained = new Map(pool.map(group => [group.userData.raceSceneryStation, group]));
      const wanted = new Set(placements.map(placement => placement.id));
      for (const group of pool) group.visible = false;
      for (const placement of placements) {
        const group = retained.get(placement.id) ?? pool.find((candidate, index) => available.has(candidate)
          && !wanted.has(candidate.userData.raceSceneryStation) && (variants === 1 || index % variants === placement.variant));
        if (!group) continue;
        available.delete(group); group.userData.raceSceneryStation = placement.id;
        group.userData.streetscapeBlock = placement.block;
        place(group, placement.p, placement.side, placement.clearance, placement.kind !== 'tree');
        group.scale.fromArray(placement.scale); group.rotation.y += placement.yaw;
      }
    };
    const periodCity = this.periodCity.active;
    assign(this.buildings, periodCity ? [] : window.buildings, 4);
    assign(this.apartments, periodCity ? [] : window.apartments, 2);
    if (!periodCity) assign(this.trees, window.trees, 1);
    // Ginkgo-style rows along the period city's set-back avenues and the
    // Arcade passes: never in Kanda's tight frontage, on the moat curb (which
    // plants its own) or along the harbour.
    else populate(this.trees, 15, 60, 7.5, (tree, station, p, side) => {
      const district = this.periodDistrictAt?.(p, side as -1 | 1);
      // Kanda's pavements keep a row of young street trees at the kerb (the
      // user's rain-night target), clear of the shopping-street lamps every 16 m.
      const kerb = district === 'kanda';
      place(tree, p, side, kerb ? 1.15 : 2.55, false);
      tree.scale.setScalar((kerb ? .66 : .62) + modulo(station * 5, 3) * .05);
      tree.rotation.y += station * 2.39996;
      tree.visible = tree.visible && course.style !== 2 && !['moat', 'harbour', 'quay'].includes(district ?? 'kanda')
        && (!kerb || modulo(p, 16) > 3 && modulo(p, 16) < 13)
        && this.periodCity.plantingClear(tree.position.x, tree.position.z, kerb ? .9 : 2.1);
    });
    // The Arcade forests keep their banks of trees, but none on the harbour.
    const wooded = (p: number, side: number) => !periodCity || !['harbour', 'quay'].includes(this.periodDistrictAt?.(p, side as -1 | 1) ?? 'forest');
    // Cherries line Nikko's Sakura Pass and Chidorigafuchi's moat (left) curb.
    const flowering = sceneFor(course)?.trees;
    const blossoming = (p: number, side: number) => periodCity && (!sceneFor(course) && course.style === 2 ? wooded(p, side)
      : !!flowering && (side > 0 || flowering.bothSides) && !!this.sakuraRange && p >= this.sakuraRange[0] && p <= this.sakuraRange[1]
        && (!flowering.bothSides || wooded(p, side)));
    // Autumn maples (refine round 4): every repaint of the momiji routes lines both sides with a continuous wall of
    // crowns, so they stand 8 m apart (cherries 12 m), every other one in a second row 6-9 m out, so the crowns overlap
    // in depth rather than standing in one line; few are kept behind the chase camera, so the window reaches ahead.
    const momiji = flowering?.kind === 'momiji';
    populate(this.sakura, momiji ? 8 : 12, momiji ? 16 : 50, momiji ? 4 : 6, (tree, station, p, side) => {
      place(tree, p, side, momiji && modulo(station, 2) === 1 ? 6 + modulo(station * 3, 4) : course.style === 3 ? 2.9 : 3.1, false);
      tree.scale.setScalar(1.15 + modulo(station * 7, 4) * .08);
      tree.rotation.y += station * 2.39996;
      tree.visible = tree.visible && blossoming(p, side) && this.periodCity.plantingClear(tree.position.x, tree.position.z, 2.2)
        && (!this.slope || this.slope.clearOfOtherLegs(tree.position.x, tree.position.z, p, 2.5));
    });
    if (this.cityLayout && this.cityBatch) {
      const cityWindow = selectCityBlocks(this.cityLayout, progress);
      this.cityBatch.setPlacements(cityWindow);
      this.cityPlotBatch.setPlots(this.cityPlotLayout ?? null, cityWindow);
      this.cityGardenBatch.setGardens(this.cityGardenLayout ?? null, cityWindow);
      for (const tree of this.trees) tree.visible = tree.visible
        && cityBlocksPlantingClear(this.cityLayout, tree.position.x, tree.position.z, 5.1 * tree.scale.x)
        && (!this.cityPlotLayout || cityPlotsPlantingClear(this.cityPlotLayout, tree.position.x, tree.position.z, 5.1 * tree.scale.x));
    }
    // The period city plants only its palace side: pines along the moat curb,
    // woods over the far stone wall, the park lawns and the shrine precinct.
    const periodTree = (tree: THREE.Group, station: number, p: number, side: number, far: boolean) => {
      const open = this.periodCity.openAt(p, side as -1 | 1), variant = modulo(station * 7 + (side > 0 ? 3 : 0), 11);
      if (!open) { tree.visible = false; return; }
      let offset = (far ? 26 : 8) + variant % 4 * (far ? 9 : 5), lift = 0;
      // Chidorigafuchi's curb is planted with the cherries instead.
      if (!far && open.district === 'moat' && this.sakuraRange && p >= this.sakuraRange[0] && p <= this.sakuraRange[1]) { tree.visible = false; return; }
      if (open.district === 'moat') {
        offset = far ? MOAT.water + moatWidth(p) + MOAT.batter + 5 + variant % 4 * 4.5 : 2.75 + variant % 2 * .35;
        lift = far ? MOAT.top : 0;
      } else if (open.district === 'forest' && !this.slope) lift = terrainHeightAt(offset, p, side);
      place(tree, p, side, offset, false);
      tree.position.y += lift;
      if (open.district === 'forest' && this.slope) {
        tree.position.y = this.slope.heightAt(tree.position.x, tree.position.z);
        if (!Number.isFinite(tree.position.y) || !this.slope.clearOfOtherLegs(tree.position.x, tree.position.z, p, 3)) { tree.visible = false; return; }
      }
      tree.scale.setScalar((far ? 1.25 : .9) + variant % 3 * .18);
      tree.rotation.y += station * 2.39996;
      tree.visible = tree.visible && (far || open.district !== 'moat' || variant % 3 !== 1)
        && this.periodCity.plantingClear(tree.position.x, tree.position.z, 3);
    };
    populate(this.forest, 8, 65, 4, (tree, station, p, side) => {
      if (periodCity && course.style === 3) { periodTree(tree, station, p, side, false); return; }
      const variant = modulo(station * 13 + (side > 0 ? 1 : 0), 7);
      const offset = 19 + variant % 3 * 8;
      place(tree, p, side, offset, false);
      tree.scale.setScalar(1.35 + variant % 3 * 0.22);
      tree.rotation.y += station * 2.39996;
      if (course.style === 3) { tree.scale.multiplyScalar(0.75); tree.visible = tree.visible && variant < 2; }
      else if (this.slope) {
        tree.position.y = this.slope.heightAt(tree.position.x, tree.position.z);
        tree.visible = tree.visible && Number.isFinite(tree.position.y) && this.slope.clearOfOtherLegs(tree.position.x, tree.position.z, p, 3);
      } else {
        tree.position.y += terrainHeightAt(offset, p, side);
      }
      tree.visible = tree.visible && streetscapePlantingClear(layout, p, side as -1 | 1, offset, 5.1 * tree.scale.x);
      if (this.cityLayout) tree.visible = tree.visible
        && cityBlocksPlantingClear(this.cityLayout, tree.position.x, tree.position.z, 5.1 * tree.scale.x);
      if (this.cityPlotLayout) tree.visible = tree.visible
        && cityPlotsPlantingClear(this.cityPlotLayout, tree.position.x, tree.position.z, 5.1 * tree.scale.x);
      if (periodCity) tree.visible = tree.visible && wooded(p, side) && this.periodCity.plantingClear(tree.position.x, tree.position.z, 3.6 * tree.scale.x);
    });
    // Continue the vegetation up the banks instead of ending every tree at the
    // same shallow roadside strip and exposing an empty hill behind it.
    populate(this.woodland, 12, 70, 6, (tree, station, p, side) => {
      if (periodCity && course.style === 3) { periodTree(tree, station, p, side, true); return; }
      const variant = modulo(station * 19 + (side > 0 ? 3 : 0), 11);
      const offset = 54 + variant % 3 * 19;
      place(tree, p, side, offset, false);
      tree.scale.setScalar(1.4 + variant % 4 * 0.22);
      tree.rotation.y += station * 2.39996 + 0.9;
      if (this.slope) {
        tree.position.y = this.slope.heightAt(tree.position.x, tree.position.z);
        tree.visible = tree.visible && Number.isFinite(tree.position.y) && this.slope.clearOfOtherLegs(tree.position.x, tree.position.z, p, 3);
      } else tree.position.y += terrainHeightAt(offset, p, side);
      tree.visible = tree.visible && course.style !== 3 && wooded(p, side)
        && this.periodCity.plantingClear(tree.position.x, tree.position.z, 3.6 * tree.scale.x);
      tree.visible = tree.visible && streetscapePlantingClear(layout, p, side as -1 | 1, offset, 5.1 * tree.scale.x);
    });
    if (this.understory) {
      const patches: UnderstoryPatch[] = [];
      const spacing = 24, stationCount = Math.max(1, Math.ceil(course.length / spacing));
      const step = course.circuit ? course.length / stationCount : spacing;
      const start = Math.floor((progress - 48) / step);
      for (let i = 0; i < 15; i++) for (const side of [-1, 1]) {
        const station = course.circuit ? modulo(start + i, stationCount) : start + i, p = station * step;
        if (!course.circuit && (p < course.poses[0]!.p || p > course.poses.at(-1)!.p)) continue;
        if (course.style === 3 && modulo(station, 3) !== 0) continue;
        const at = poseAt(course, p), offset = course.style === 3 ? 18 : 31;
        if (!streetscapePlantingClear(layout, p, side as -1 | 1, offset, course.style === 3 ? 5 : 11)) continue;
        const center = point(at, side * (at.width + offset));
        if (this.cityLayout && !cityBlocksPlantingClear(this.cityLayout, center.x, center.z, 5)) continue;
        if (this.cityPlotLayout && !cityPlotsPlantingClear(this.cityPlotLayout, center.x, center.z, Math.hypot(2.5, step / 2))) continue;
        if (!this.periodCity.plantingClear(center.x, center.z, Math.hypot(2.5, step / 2)) || !wooded(p, side)
          || this.periodCity.openAt(p, side as -1 | 1)?.district === 'moat') continue;
        const bankHeight = (distance: number, stationP: number) => {
          return course.style === 3 ? 0 : terrainHeightAt(distance, stationP, side);
        };
        const slope = this.slope;
        if (slope) {
          center.y = slope.heightAt(center.x, center.z);
          if (!Number.isFinite(center.y) || !slope.clearOfOtherLegs(center.x, center.z, p, 9)) continue;
        } else center.y += bankHeight(offset, p);
        patches.push({ seed: station * 31 + side * 197, x: center.x, y: center.y, z: center.z,
          heading: at.heading, width: course.style === 3 ? 5 : 16, depth: step,
          density: course.style === 3 ? 0.45 : 0.85, detail: 'far', castShadow: i < 5,
          heightAt: slope ? (x, z) => {
            const there = point(poseAt(course, p + z), side * (at.width + offset + side * x)), h = slope.heightAt(there.x, there.z);
            return Number.isFinite(h) ? h - center.y : 0;
          } : (x, z) => bankHeight(offset + side * x, p + z) - bankHeight(offset, p) + poseAt(course, p + z).y - at.y });
      }
      this.understory.setPatches(patches);
    }
    populate(this.lamps, this.lampSpacing, 50, 0, (lamp, _station, p, side) => place(lamp, p, side, 1.8));
    let index = 0;
    const railCount = Math.max(1, Math.ceil(course.length / 5));
    const railStep = course.circuit ? course.length / railCount : 5;
    const railProgress = course.circuit ? modulo(progress, course.length) : progress;
    const railStart = Math.floor((railProgress - 70) / railStep);
    for (let station = railStart; station < railStart + 98; station++) for (const side of [-1, 1]) {
      const p = (course.circuit ? modulo(station, railCount) : station) * railStep;
      if (!course.circuit && (p < course.poses[0]!.p || p + railStep > course.poses.at(-1)!.p)) continue;
      const a = poseAt(course, p), b = poseAt(course, p + railStep);
      this.scratch.position.copy(point(a, side * (a.width + 0.6), 0.43)); this.scratch.rotation.set(0, a.heading, 0); this.scratch.scale.set(1, 1, 1);
      this.scratch.updateMatrix(); this.posts.setMatrixAt(index, this.scratch.matrix);
      const start = point(a, side * (a.width + 0.6), 0.7), end = point(b, side * (b.width + 0.6), 0.7);
      this.scratch.position.copy(start).lerp(end, 0.5); this.scratch.lookAt(end); this.scratch.scale.set(1, 1, start.distanceTo(end));
      this.scratch.updateMatrix(); this.rails.setMatrixAt(index, this.scratch.matrix); index++;
    }
    this.posts.count = this.rails.count = index; this.posts.instanceMatrix.needsUpdate = this.rails.instanceMatrix.needsUpdate = true;
  }

  private draw(course: Course, cars: VisualCar[], slot: number, view: 'chase' | 'bumper' | 'aerial', hazards: Hazard[], wet: boolean, time: number,
    light: { readonly mood: RaceMood; readonly daylight: number } | null = null): void {
    this.setCourse(course);
    const player = cars[slot]; if (!player) return;
    const at = poseAt(course, player.p), ahead = poseAt(course, player.p + 20);
    const reset = !Number.isFinite(this.lastProgress) || player.p < this.lastProgress - 5 || Math.abs(player.p - this.lastProgress) > 100;
    const dt = reset ? 1 : clamp(time - this.lastTime, 0, 0.1); this.lastTime = time; this.lastProgress = player.p;
    const speed = this.reduced.matches ? 0 : clamp(player.speed / 78, 0, 1);
    this.speedEnvelope += (speed - this.speedEnvelope) * (1 - Math.exp(-dt * 7));
    this.boostEnvelope += ((player.boosting && !this.reduced.matches ? 1 : 0) - this.boostEnvelope) * (1 - Math.exp(-dt * 10));
    this.placeScenery(course, player.p);
    this.periodCity.update(player.p, reset);
    this.periodCity.animate(player.p, this.reduced.matches ? 0 : time, this.lastRoadWetness);
    const playerPosition = point(at, player.lateral);
    const closestLamps = this.lamps.filter(lamp => lamp.visible).sort((a, b) => a.position.distanceToSquared(playerPosition) - b.position.distanceToSquared(playerPosition));
    this.lightPools.forEach((light, i) => {
      // Keep every bounded light slot in Three's shader layout. Unassigned
      // slots receive zero intensity below, without compiling a new program
      // for every material as street lamps enter or leave range.
      const lamp = closestLamps[i];
      if (lamp) {
        light.position.copy(lamp.localToWorld(new THREE.Vector3(0, 6.58, -1.28)));
        light.target.position.copy(light.position); light.target.position.y -= 7;
      }
    });
    // The nearest heads wash the facades beside them; every visible lamp's head also stays a glowing point down
    // the street (the user's rain-night concept).
    const washed = closestLamps.slice(0, this.washHeads.length).map((lamp, i) => lamp.localToWorld(this.washHeads[i]!.set(0, 6.58, -1.28)));
    setPeriodCityLampHeads(washed);
    let farLamps = 0;
    for (const lamp of closestLamps) {
      if (farLamps >= 40) break;
      lamp.updateMatrixWorld();
      this.lampFarLights.set(farLamps++, lamp.localToWorld(this.lampHead.set(0, 6.58, -1.28)), LAMP_FAR_LIGHT, LAMP_FAR_LIGHT_SIZE);
    }
    this.lampFarLights.commit(farLamps);
    // The period city's shop fronts, or the classic frontage's bays and fixtures.
    const shopSources = this.periodCity.active
      ? this.periodCity.nearestFixtures(playerPosition, 12, this.cityFixtures).map((fixture, i) => ({
        position: fixture.position, target: fixture.target, fixtureId: `period-city:${i}`, bay: false, secondary: false,
        merchandise: false, areaPosition: null as THREE.Vector3 | null, areaTarget: null as THREE.Vector3 | null }))
      : this.buildings.filter(building => building.visible && building.position.distanceToSquared(playerPosition) < 60 ** 2)
      .flatMap(building => {
        const bay = !!building.userData.openGarage;
        // One primary source per shop keeps the visible merchandise lit before
        // allocating a second light to an already illuminated building.
        const sources = [{
          position: bay ? building.userData.garageLightPosition : building.userData.shopfrontLightPosition ?? building.userData.shopLightPosition,
          target: bay ? building.userData.garageLightTarget : building.userData.shopfrontLightTarget ?? building.userData.shopLightTarget,
          fixtureId: `${building.uuid}:${building.userData.raceSceneryStation ?? 'fixed'}`,
          bay, secondary: false, merchandise: !bay && !!building.userData.shopfrontLightPosition,
        }, { position: building.userData.shopLightPosition, target: building.userData.shopLightTarget,
          fixtureId: '', bay: false, secondary: true, merchandise: false }];
      return sources.map(source => ({ ...source,
          position: building.localToWorld(new THREE.Vector3().fromArray(source.position)),
          target: building.localToWorld(new THREE.Vector3().fromArray(source.target)),
          areaPosition: source.merchandise
            ? building.localToWorld(new THREE.Vector3(source.position[0], 2.819, building.userData.front - 0.92))
            : null,
          areaTarget: source.merchandise
            ? building.localToWorld(new THREE.Vector3(source.position[0], 1.25, building.userData.front - 5))
            : null,
        }));
      });
    const closestShops = shopSources.sort((a, b) => {
        const score = (shop: typeof a) => {
          const longitudinal = (shop.position.x - playerPosition.x) * Math.sin(at.heading)
            + (shop.position.z - playerPosition.z) * Math.cos(at.heading);
          const behind = view !== 'aerial' && longitudinal < -6;
          return shop.position.distanceToSquared(playerPosition) + (behind ? 3600 : 0) + (shop.secondary ? 10000 : 0);
        };
        return score(a) - score(b);
      });
    this.shopLights.forEach((light, i) => {
      const shop = closestShops[i];
      // Keep the bounded light layout stable through quiet blocks so crossing
      // a shop threshold does not trigger new shaders throughout the scene.
      light.visible = true;
      if (!shop) { light.intensity = 0; return; }
      // A physical pool of tungsten light connects the illuminated fixture to
      // its doorway and pavement, using the same local mount as the geometry.
      light.position.copy(shop.position); light.target.position.copy(shop.target);
      light.angle = shop.merchandise ? 1.30 : .96;
      light.penumbra = shop.merchandise ? .22 : .8;
      light.intensity = shop.bay ? 255 : shop.merchandise ? 90 : 170;
    });
    const fluorescentShops = closestShops.filter(shop => shop.merchandise && !shop.secondary).slice(0, this.shopAreaLights.length);
    const selected = new Map(fluorescentShops.map(shop => [shop.fixtureId, shop]));
    // A ranked shop can change every few metres. Never teleport an emitting
    // area source between two different visible fixtures during continuous
    // driving: extinguish it at the old tube, then relight it at the new one.
    const fadeSeconds = 0.10;
    this.shopAreaLightSlots.forEach((slot, i) => {
      if (reset) { slot.fixtureId = null; slot.gain = 0; }
      const shop = slot.fixtureId ? selected.get(slot.fixtureId) : null;
      if (shop) {
        this.shopAreaLights[i]!.position.copy(shop.areaPosition!);
        this.shopAreaLights[i]!.lookAt(shop.areaTarget!);
        slot.gain = Math.min(1, slot.gain + dt / fadeSeconds);
      } else if (slot.fixtureId) {
        slot.gain = Math.max(0, slot.gain - dt / fadeSeconds);
        if (slot.gain <= 1e-6) { slot.gain = 0; slot.fixtureId = null; }
      }
    });
    const assigned = new Set(this.shopAreaLightSlots.map(slot => slot.fixtureId));
    for (const shop of fluorescentShops) {
      if (assigned.has(shop.fixtureId)) continue;
      const i = this.shopAreaLightSlots.findIndex(slot => slot.fixtureId === null);
      if (i < 0) break;
      const slot = this.shopAreaLightSlots[i]!;
      slot.fixtureId = shop.fixtureId;
      // Relocation occurs only in a dark frame; the next draw fades in.
      slot.gain = reset ? 1 : 0;
      this.shopAreaLights[i]!.position.copy(shop.areaPosition!);
      this.shopAreaLights[i]!.lookAt(shop.areaTarget!);
      assigned.add(shop.fixtureId);
    }
    this.shopAreaLights.forEach((light, i) => {
      const slot = this.shopAreaLightSlots[i]!;
      light.intensity = slot.fixtureId === null ? 0 : this.shopAreaLightLuminance * slot.gain;
    });
    const carPose = { ...at, heading: at.heading + player.yaw };
    this.headlights.forEach((light, i) => {
      const origin = point(at, player.lateral).add(point({ ...carPose, x: 0, y: 0, z: 0 }, i ? 0.66 : -0.66, 0.68, 2.0));
      light.position.copy(origin); light.target.position.copy(origin).add(new THREE.Vector3(Math.sin(carPose.heading) * 18, -0.65, Math.cos(carPose.heading) * 18));
    });
    // Rain eases in and out instead of stepping; a course change or seek snaps.
    this.weather = reset ? Number(wet) : this.weather + (Number(wet) - this.weather) * (1 - Math.exp(-dt * WEATHER_RATE));
    // Each Arcade track keeps its own cutscene mood; street routes bring their
    // own light, and Tokyo's chapter clock sweeps it from night to sunrise.
    const mood = light?.mood ?? ARCADE_MOODS[course.style] ?? ARCADE_MOODS[0]!;
    const daylight = light ? light.daylight : mood.daylight ?? 0;
    // One control, two legs: night -> dusk, then dusk -> sunrise.
    const dusk = clamp(daylight / DUSK_DAYLIGHT, 0, 1);
    const morning = clamp((daylight - DUSK_DAYLIGHT) / (1 - DUSK_DAYLIGHT), 0, 1);
    const swing = THREE.MathUtils.smoothstep(daylight, 0.6, 0.9);
    const sunrise = THREE.MathUtils.smoothstep(daylight, 0.86, 1);
    // Refine round 4: a late-day route's golden hours (its cutscene-style repaints: dry asphalt facing the low sun warm
    // grey-gold with a glare sheen, warm bounce on the verges and in the shade). With the lamps off by afternoon light,
    // the lavender fill alone lit the road violet.
    const golden = mood.lowSun ? THREE.MathUtils.smoothstep(daylight, 0.7, 0.95) : 0;
    // Damp asphalt mirrors the lamps (most at the harbour) and dries toward
    // sunrise; rain saturates it. The low sun's specular gets a soft ceiling.
    // A late-day route dries in its golden hours too (refine round 4: its repaints keep the afternoon road dry under
    // the low sun, wet only after dusk; half dry, the leaf carpets on its verges glittered like a wet road).
    const roadWetness = THREE.MathUtils.lerp(THREE.MathUtils.lerp(mood.damp, SUNRISE_ROAD_WETNESS, Math.max(sunrise, golden)), 1, this.weather);
    this.roadFinish.setWetness(roadWetness); this.lastRoadWetness = roadWetness;
    // A soaked night road stays navy under the lamps' own reflections (the rain-night target); dusk keeps its glowing sky.
    // Refine round 4: a damp dusk road is dark too (the street routes' dusk repaints: a navy road between the lights'
    // streaks, where the dusk key and sky lit ours grey-violet); sunrise and afternoon roads keep their light.
    const duskRoad = dusk * (1 - morning) * THREE.MathUtils.smoothstep(roadWetness, 0.35, 0.8);
    // Refine round 4: from a damp road (0.35; was 0.55) and to 80% of the pool light (was 60%): Hakone's damp night
    // road (0.6) kept nearly all of its lamp pools and read as pale grey-violet asphalt between the streaks, where its
    // repaint keeps the road dark.
    const nightRoad = (1 - dusk) * THREE.MathUtils.smoothstep(roadWetness, 0.35, 0.9);
    this.roadFinish.setEnvironmentDim(Math.max(nightRoad * 0.8, duskRoad * DUSK_ROAD_DIM));
    this.roadPoolDim = Math.max(nightRoad * NIGHT_ROAD_POOL_DIM, duskRoad * DUSK_ROAD_DIM);
    this.roadFinish.setPoolDim(this.roadPoolDim);
    this.roadAmbientDim = duskRoad * DUSK_ROAD_AMBIENT_DIM;
    this.roadFinish.setAmbientDim(this.roadAmbientDim);
    this.roadFinish.setKeySpecularLimit(THREE.MathUtils.lerp(THREE.MathUtils.lerp(KEY_ROAD_SPECULAR_DUSK, KEY_ROAD_SPECULAR_SUNRISE, sunrise),
      KEY_ROAD_SPECULAR_GOLDEN, golden));
    // Refine round 4: a late-day route's street lamps are off by afternoon light and come on as it turns to dusk, as
    // its cutscene-style repaints paint it; lit, the near shopping-lamp globes drew as white clouds over the golden sky.
    const lampsOn = mood.lowSun ? 1 - THREE.MathUtils.smoothstep(daylight, 0.62, 0.85) : 1;
    const lampIntensity = mood.lampIntensity * THREE.MathUtils.lerp(1, SUNRISE_LAMP_GAIN, sunrise) * lampsOn;
    const poolIntensity = mood.lampIntensity * THREE.MathUtils.lerp(1, SUNRISE_POOL_GAIN, sunrise) * lampsOn;
    this.lightPools.forEach((light, i) => {
      light.color.copy(mood.lamp); light.intensity = closestLamps[i] ? poolIntensity : 0;
      light.angle = mood.lampCone.angle; light.penumbra = mood.lampCone.penumbra; light.distance = mood.lampCone.distance;
    });
    this.roadMaterial.color.lerpColors(ROAD_ALBEDO, ROAD_ALBEDO_SUNRISE, sunrise).lerp(ROAD_ALBEDO_GOLDEN, golden);
    // Lit windows, shopfronts and signs follow the mood: night -> dusk -> sunrise.
    // A route that lights nearly every window at dusk (refine round 4: Kyoto's and Aizu's repaints) raises the dusk
    // shares toward its own, easing back to the night's and the sunrise's.
    const routeWindows = mood.windows === undefined ? 0 : THREE.MathUtils.clamp(mood.windows, 0, 1) * dusk * (1 - morning);
    const goldenShare = GOLDEN_WINDOW_SHARE * golden;
    const upperLit = Math.max(windowLights('upper', dusk, morning), routeWindows, goldenShare);
    const groundLit = Math.max(windowLights('ground', dusk, morning), routeWindows, goldenShare);
    const windowGain = windowLights('gain', dusk, morning) * (1 + GOLDEN_WINDOW_GAIN * goldenShare);
    setWindowLights(upperLit, groundLit, windowGain, windowLights('cool', dusk, morning));
    setShopfrontGlow(windowLights('diffuser', dusk, morning), windowLights('signs', dusk, morning));
    setSignGlow(windowLights('signs', dusk, morning));
    // Maples glow far less than lit night cherries: an even glow over the crowns flattened them to salmon.
    const crownGlow = (.12 + .32 * (1 - dusk) + .28 * sunrise) * (this.momiji ? .35 : 1);
    // The painted crown light only by day: at dusk it held the lamp-lit crowns under its highlight ceiling, darker than
    // the repaints' lamp-lit reds (Kyoto's torii avenue).
    this.mapleLight.value = this.momiji ? THREE.MathUtils.smoothstep(daylight, 0.55, 0.8) : 0;
    for (const tone of this.blossomTones) tone.emissiveIntensity = crownGlow;
    setPeriodCityLighting(upperLit, groundLit, windowGain, windowLights('cool', dusk, morning),
      windowLights('signs', dusk, morning) * PERIOD_SIGN_GAIN, THREE.MathUtils.lerp(1, PERIOD_SUNRISE_LAMPS, morning) * lampsOn,
      windowLights('signs', dusk, morning) * PERIOD_FLOODLIGHTS);
    // The cutscenes separate cream/gold illuminated surfaces from charcoal
    // foreground shadows and violet exterior air. Avoid blue fill overwhelming
    // the physical paint, concrete and amber practical lights.
    this.scene.backgroundIntensity = 0.025 + daylight * 0.06;
    // Night keeps a violet moonlit floor (unlit asphalt reads dark violet-
    // brown, not black) under the amber pools.
    const night = 1 - dusk;
    for (let i = 0; i < this.foliageMaterials.length; i++)
      this.foliageMaterials[i]!.envMapIntensity = THREE.MathUtils.lerp(1, NIGHT_FOLIAGE_ENVIRONMENT, night);
    // The ceiling only bites after dark: by day the sun lights the crowns in full.
    this.blossomDirectCap.value = THREE.MathUtils.lerp(DAY_DIRECT_CAP, BLOSSOM_DIRECT_CAP, night);
    this.foliageDirectCap.value = THREE.MathUtils.lerp(DAY_DIRECT_CAP, FOLIAGE_DIRECT_CAP, night);
    this.barkDirectCap.value = THREE.MathUtils.lerp(DAY_DIRECT_CAP, BARK_DIRECT_CAP, night);
    this.scene.environmentIntensity = 0.09 + daylight * 0.16 + 0.05 * night;
    this.fill.intensity = 0.08 + daylight * 0.12 + 0.12 * night + GOLDEN_FILL * golden;
    this.fill.color.copy(MOOD.fillSky).lerp(MOOD.fillGolden, golden);
    this.fill.groundColor.copy(MOOD.fillGround).lerp(MOOD.fillGoldenGround, golden);
    const air = daylight * 0.55;
    this.fog.color.lerpColors(MOOD.fogNightDry, MOOD.fogDuskDry, air)
      .lerp(this.scratchColor.lerpColors(MOOD.fogNightWet, MOOD.fogDuskWet, air), this.weather);
    this.fog.density = THREE.MathUtils.lerp(0.0028, 0.0052, this.weather);
    // A weak lavender moon at night lets the amber practicals dominate; the
    // warm dusk key becomes a low amber sunrise. Rain keeps the key warm.
    // The golden hours' low sun is the brightest light of the day, and its long tree shadows stay warm and open (the
    // late-day routes' repaints paint the road sunlit through the crowns).
    this.keyLight.intensity = 0.6 + 0.9 * dusk + 0.3 * morning + GOLDEN_KEY * golden;
    setPeriodCityGolden(golden);
    this.keyLight.color.lerpColors(MOOD.keyMoon, MOOD.keyDusk, dusk).lerp(MOOD.keySunrise, morning)
      .lerp(MOOD.keyWet, this.weather * dusk * (1 - sunrise));
    // The sun keeps its world direction through corners; only the shadow
    // volume follows the race to retain detail along long routes. Tokyo's
    // late chapters swing it low toward the painted sunrise, which rises.
    // A late-day route keeps its sun's bearing through dusk (refine round 4: Akechidaira's repaint sets the afterglow
    // ahead over the mountains; swinging back to the dusk key put the glow behind the camera).
    const azimuth = KEY_AZIMUTH + mood.sunTurn * (mood.lowSun ? 1 : swing);
    // In a late-day route's golden hours the key stands higher than the painted sun (GOLDEN_KEY_ELEVATION): at the
    // sun's 8-11 degrees it grazed the road and verges, which stayed dark where the repaints bathe them in warm light.
    const elevation = THREE.MathUtils.lerp(THREE.MathUtils.lerp(KEY_ELEVATION, SUNRISE_ELEVATION, swing) + 0.05 * sunrise,
      GOLDEN_KEY_ELEVATION, golden);
    this.keyDirection.set(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation));
    // The golden shadows open with the sun behind the camera (GOLDEN_SHADOW_OPEN_BEHIND).
    const sunAhead = (this.keyDirection.x * Math.sin(at.heading) + this.keyDirection.z * Math.cos(at.heading))
      / Math.max(Math.hypot(this.keyDirection.x, this.keyDirection.z), 1e-6);
    this.keyLight.shadow.intensity = 1 - THREE.MathUtils.lerp(GOLDEN_SHADOW_OPEN, GOLDEN_SHADOW_OPEN_BEHIND,
      THREE.MathUtils.smoothstep(-sunAhead, 0.2, 0.8)) * golden;
    this.keyLight.target.position.copy(point(at, 0, 0, 16));
    this.keyLight.position.copy(this.keyLight.target.position).addScaledVector(this.keyDirection, KEY_DISTANCE);
    this.scene.backgroundRotation.y = this.scene.environmentRotation.y = HDR_WARM_BAND_ANGLE - azimuth;
    if (mood.lowSun) {
      const low = THREE.MathUtils.lerp(elevation, mood.lowSunElevation ?? LOW_SUN_ELEVATION, swing);
      this.paintedSun.set(Math.cos(azimuth) * Math.cos(low), Math.sin(low), Math.sin(azimuth) * Math.cos(low));
    } else this.paintedSun.copy(this.keyDirection);
    this.paintedSky.setRacingSky(daylight, this.paintedSun, sunrise, mood);
    // A late-day route's afterglow (refine round 4: Akechidaira's repaint, the sun just set ahead): the golden sky holds
    // through dusk toward its bearing, fading into the night below daylight 0.3.
    this.paintedSky.setRacingGolden(mood.lowSun ? Math.max(THREE.MathUtils.smoothstep(daylight, 0.6, 0.85),
      THREE.MathUtils.smoothstep(daylight, 0.3, 0.5)) : 0);
    this.cars.forEach((model, i) => {
      const car = cars[i]; model.group.visible = !!car && !(view === 'bumper' && i === slot) && !(car?.retired && i !== slot);
      if (!car) { this.vehicleAmbient.setCar(i, model.group.position, 0, 0); return; }
      const cp = poseAt(course, car.p); model.group.position.copy(point(cp, car.lateral, 0.003));
      model.group.rotation.set(0, cp.heading + car.yaw, 0);
      const grade = poseAt(course, car.p + 2).y - poseAt(course, car.p - 2).y;
      model.group.rotateX(-Math.atan2(grade, 4));
      if (model.group.position.distanceToSquared(point(at, player.lateral)) > 450 ** 2) model.group.visible = false;
      let gap = car.p - player.p;
      if (course.circuit) gap = modulo(gap + course.length / 2, course.length) - course.length / 2;
      const inCameraCorridor = Math.abs(car.lateral - player.lateral) < 1.4;
      const opacity = view === 'aerial' || i === slot || !inCameraCorridor ? 1 : clamp((gap + 2.9) / 2.2, 0, 1);
      model.setOpacity(opacity); if (opacity === 0) model.group.visible = false;
      // A bumper camera hides the body for viewing but the physical car still
      // blocks sky light. Retired/distant cars and corridor fades clear the field.
      const castsAmbient = !(car.retired && i !== slot) && model.group.position.distanceToSquared(point(at, player.lateral)) <= 450 ** 2;
      this.vehicleAmbient.setCar(i, model.group.position, cp.heading + car.yaw, castsAmbient ? opacity : 0);
      model.setAppearance(car.color, car.accent, car.aero);
      model.animate(car.speed, car.steer, car.braking, car.boosting, time);
      // Distant cars are drawn in their livery's palette ramp.
      this.pixelArt.setMoverColour(i, car.color);
    });
    // Wet roads mirror the tail lamps in long red streaks (the user's rain-night target).
    this.tailStreaks.update(this.cars, roadWetness, this.camera.position);
    if (reset) this.effects.reset();
    this.effects.update(cars.map((car, i) => {
      const cp = poseAt(course, car.p), heading = cp.heading + car.yaw;
      const contacts = (this.cars[i]?.group.userData.rearTyreContacts ?? [[0.7, 0, -1.13], [-0.7, 0, -1.13]]) as number[][];
      return { rearTyres: contacts.map(contact => {
        const tyre = point(cp, car.lateral).add(point({ ...cp, x: 0, y: 0, z: 0, heading }, contact[0]!, 0, contact[2]!));
        tyre.y = poseAt(course, car.p + contact[2]! * Math.cos(car.yaw) - contact[0]! * Math.sin(car.yaw)).y;
        return tyre;
      }), heading, speed: car.speed, slip: car.slip, braking: car.braking, visible: !car.retired };
    }), time, wet, this.reduced.matches);
    for (const mesh of this.hazards.values()) mesh.visible = false;
    for (const hazard of hazards) {
      let relative = hazard.p - player.p;
      if (course.circuit) relative = modulo(relative + 100, course.length) - 100;
      if (relative < -80 || relative > 410) continue;
      let mesh = this.hazards.get(hazard.id);
      if (!mesh) {
        if (hazard.kind === 'tree') mesh = this.detailedHazardTree?.(hazard.id.length) ?? createTree(7, false);
        else if (hazard.kind === 'sign') mesh = createSign(this.flag);
        else {
          const centre = poseAt(course, hazard.p), origin = point(centre, hazard.lateral);
          const c = Math.cos(centre.heading), s = Math.sin(centre.heading);
          const halfWidth = Math.max(0.1, hazard.halfWidth), halfLength = Math.max(0.1, hazard.halfLength);
          const rows = Math.max(8, Math.min(48, Math.ceil(halfLength * 4))), columns = 8;
          const positions: number[] = [], indices: number[] = [], uvs: number[] = [], edge: number[] = [];
          for (let row = 0; row <= rows; row++) {
            const v = row / rows * 2 - 1, rowPose = poseAt(course, hazard.p + v * halfLength);
            const width = halfWidth * Math.sqrt(Math.max(0, 1 - v * v));
            for (let column = 0; column <= columns; column++) {
              const vertex = point(rowPose, hazard.lateral + (column / columns * 2 - 1) * width);
              const dx = vertex.x - origin.x, dz = vertex.z - origin.z;
              positions.push(c * dx - s * dz, vertex.y - origin.y, s * dx + c * dz);
              uvs.push((hazard.lateral + (column / columns * 2 - 1) * width) / 3, rowPose.p / 3);
              edge.push(1 - Math.sqrt(v * v + ((column / columns * 2 - 1) * width / halfWidth) ** 2));
            }
          }
          for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
            const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
            indices.push(a, c, b, b, c, d);
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
          geometry.setAttribute('oilEdge', new THREE.Float32BufferAttribute(edge, 1));
          geometry.setIndex(indices); geometry.computeVertexNormals();
          const material = new THREE.MeshPhysicalMaterial({ ...scannedSurface('asphalt_02'), color: '#48404c',
            normalScale: new THREE.Vector2(0.12, 0.12), roughness: 0.36, metalness: 0,
            clearcoat: 0.7, clearcoatRoughness: 0.22, transparent: true, opacity: 0.83, depthWrite: false });
          material.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute float oilEdge; varying float oilCoverage; void main() { oilCoverage = oilEdge;');
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'varying float oilCoverage; void main() {')
              .replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(0.0, 0.14, oilCoverage);\n#include <alphatest_fragment>');
          };
          material.customProgramCacheKey = () => 'sora-oil-asphalt-film-v1';
          this.vehicleAmbient.decorate(material);
          mesh = new THREE.Mesh(geometry, material);
          mesh.receiveShadow = true;
          // The slick's ellipse, for the pixel-art hazard drawing.
          mesh.userData.oilHalfWidth = halfWidth; mesh.userData.oilHalfLength = halfLength;
        }
        mesh.userData.raceHazardKind = hazard.kind;
        this.hazards.set(hazard.id, mesh); this.scene.add(mesh);
      }
      const hp = poseAt(course, hazard.p); mesh.position.copy(point(hp, hazard.lateral, 0.025)); mesh.rotation.set(0, hp.heading, 0);
      mesh.visible = !hazard.broken;
      if (hazard.kind === 'tree') mesh.scale.setScalar(0.65);
    }
    const aspect = this.output.width / this.output.height, mobile = aspect < 0.8;
    this.camera.aspect = aspect;
    this.camera.fov = 55 + this.speedEnvelope * 5 + this.boostEnvelope * 3;
    if (view === 'aerial') {
      this.camera.position.copy(point(at, player.lateral * 0.35, 42, -28));
      this.camera.lookAt(point(at, player.lateral * 0.35, 0, 9)); this.camera.fov = 55;
    } else if (view === 'bumper') {
      const anchor = point(at, player.lateral, 0.88), yaw = at.heading + player.yaw;
      this.camera.position.copy(anchor).add(new THREE.Vector3(Math.sin(yaw) * 1.9, 0, Math.cos(yaw) * 1.9));
      this.camera.lookAt(anchor.add(new THREE.Vector3(Math.sin(yaw) * 30, ahead.y - at.y, Math.cos(yaw) * 30)));
    } else {
      const distance = (mobile ? 10.2 : 7.4) + this.speedEnvelope * 0.9 + this.boostEnvelope * 0.6;
      this.camera.position.copy(point(at, player.lateral * 0.9, mobile ? 3.5 : 2.7, -distance));
      const target = point(at, player.lateral * 0.5, 1.15 + (ahead.y - at.y) * 0.5, mobile ? 13 : 19);
      this.camera.lookAt(target);
    }
    this.camera.updateProjectionMatrix();
    this.periodCity.placeSkyline(this.camera.position, daylight);
    // Pooled scenery first appears far into a lap (the period city's palace
    // trees, understory, distant cars): compile every material up front, off
    // the main thread where the driver supports it, instead of on first sight.
    if (!this.shadersWarmed && ['sceneryAsset', 'carAsset', 'understoryAsset'].every(key => this.output.dataset[key] !== 'loading')) {
      this.shadersWarmed = true;
      // Both finishes draw the scene into an HDR target (no tone map, linear
      // output), so compile against one: screen-target programs never match.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), previous = this.renderer.getRenderTarget();
      prepareSpotlightEarlyOut(this.renderer, this.scene);
      this.renderer.setRenderTarget(target);
      const warming = this.renderer.compileAsync(this.scene, this.camera);
      this.renderer.setRenderTarget(previous);
      void warming.catch(error => console.warn('Shader warm-up failed.', error)).finally(() => target.dispose());
    }
    if (this.treeBatch) {
      this.scene.updateMatrixWorld(true);
      this.treeBatch.update(this.camera, this.keyLight);
    }
    const pixelFinish = getPixelFinish();
    const groupedVisuals = this.regionRoute && pixelFinish;
    if (groupedVisuals !== this.groupedVisuals) {
      this.groupedVisuals = groupedVisuals;
      this.pass.setPaintedPixelGroups(groupedVisuals);
      this.groupedLighting?.configure({strength:groupedVisuals ? 1 : 0});
    }
    // The cinematic composer stays idle, with no region or 2x2 work, while
    // the pixel-art renderer draws the frame.
    this.pixelArtActive = pixelFinish && !this.regionRoute && this.renderingMode !== 'cinematic';
    this.roadFinish.setSpotSpecularLimit(this.pixelArtActive ? PIXEL_ROAD_SPOT_SPECULAR : 0);
    if (this.pixelArtActive) {
      // Wet-ground reflections follow the road finish's wetness; a camera cut
      // (view change) or a course change or seek restarts the temporal history.
      this.pixelArt.setWetness(roadWetness, this.weather);
      this.pixelArt.setNight(1 - dusk);
      setDetailedCarNight(1 - dusk);
      if (reset || view !== this.pixelArtView) this.pixelArt.resetHistory();
      // Lamp heads for the analytic wet-ground columns (nearest first), and
      // the ambient light the lamp pools are measured against.
      let emitters = 0;
      const lampSlots = this.groundEmitters.length - (this.periodCity.active ? SHOP_COLUMNS : 0);
      for (const lamp of closestLamps) {
        if (emitters >= lampSlots) break;
        const emitter = this.groundEmitters[emitters++]!;
        lamp.localToWorld(emitter.position.copy(LAMP_LENS.position));
        emitter.groundY = lamp.position.y;
        emitter.color.copy(mood.lamp);
        emitter.intensity = LAMP_LENS.radiance * lampIntensity / LAMP_LENS.intensity;
        emitter.width = LAMP_LENS.width; emitter.head = true; emitter.maxCells = 0;
      }
      // The nearest lit shop fronts mirror in the wet pavement and road as well (the repaints paint the pavement under
      // every lit shop gold; the screen-space trace from the pavement runs off the screen before it meets them): wide
      // columns, no lamp head, as bright as the shops are lit (none by day).
      // The shops ahead of the camera, where their pavement is in view (the nearest to the car stand beside it).
      const shopGlow = this.periodCity.active ? windowLights('ground', dusk, morning) / WINDOW_LIGHTS.night.ground : 0;
      this.camera.getWorldDirection(this.cameraAhead);
      for (let i = 0, shops = 0; shopGlow > 0.05 && i < closestShops.length && shops < SHOP_COLUMNS_MAX; i++) {
        const shop = closestShops[i]!;
        if (emitters >= this.groundEmitters.length) break;
        if (this.scratchVector.subVectors(shop.position, this.camera.position).dot(this.cameraAhead) < SHOP_COLUMN_AHEAD) continue;
        const emitter = this.groundEmitters[emitters++]!; shops++;
        emitter.position.copy(shop.position); emitter.groundY = shop.target.y - 0.2;
        emitter.color.copy(SHOP_COLUMN_COLOUR);
        emitter.intensity = LAMP_LENS.radiance * SHOP_COLUMN_GAIN * shopGlow;
        emitter.width = SHOP_COLUMN_WIDTH; emitter.head = false; emitter.maxCells = SHOP_COLUMN_CELLS;
      }
      this.pixelArt.setGroundEmitters(this.groundEmitters, emitters);
      // The road finish dims the road's direct light (its pool dim) and, at dusk, its ambient by different shares:
      // measured against the undimmed lamp pools, the ground stage took most of a damp dusk road's sky light for lamp
      // light and gathered it into amber flecks over the whole carriageway (refine round 4). The ambient, scaled by
      // the share of it kept over the share of direct light kept, measures the pools as dimmed.
      const ambientShare = (1 - this.roadAmbientDim) / Math.max(1 - this.roadPoolDim, 0.2);
      this.groundAmbient.copy(this.keyLight.color).multiplyScalar(this.keyLight.intensity * Math.max(0, this.keyDirection.y))
        .add(this.scratchColor.copy(this.fill.color).multiplyScalar(this.fill.intensity * ambientShare))
        .add(this.scratchColor.copy(GROUND_ENVIRONMENT).multiplyScalar((this.scene.environment ? this.scene.environmentIntensity : 0) * ambientShare));
      this.pixelArt.setGroundAmbient(this.groundAmbient);
      // Oil slicks on screen: flat outlined gloss instead of styled asphalt.
      let slicks = 0;
      for (const mesh of this.hazards.values()) {
        if (slicks >= this.groundHazards.length) break;
        if (!mesh.visible || mesh.userData.raceHazardKind !== 'oil') continue;
        const slick = this.groundHazards[slicks++]!;
        slick.x = mesh.position.x; slick.z = mesh.position.z; slick.heading = mesh.rotation.y;
        slick.halfWidth = mesh.userData.oilHalfWidth ?? 0.5; slick.halfLength = mesh.userData.oilHalfLength ?? 1;
      }
      this.pixelArt.setHazards(this.groundHazards, slicks);
    }
    this.pixelArtView = view;
    // Sky stars are whole art cells: scene samples per cell in pixel art, a
    // small square at display resolution otherwise.
    if (this.pixelArtActive && (this.output.width !== this.artGridWidth || this.output.height !== this.artGridHeight)) {
      this.artGridWidth = this.output.width; this.artGridHeight = this.output.height;
      this.artGridSupersample = pixelArtGrid(this.output.width, this.output.height).supersample;
    }
    this.paintedSky.setArtCell(this.pixelArtActive ? this.artGridSupersample
      : Math.max(1, Math.round(Math.min(this.output.width, this.output.height) / 540)));
    this.tailStreaks.setArtCell(this.pixelArtActive ? this.artGridSupersample : 0);
    this.pass.setPixelation(this.renderingMode === 'cinematic' && pixelFinish);
    // Streamed scenery can add materials after world creation. Install the
    // same analytic light-value shader on each newly visible material.
    if (this.groupedVisuals) this.groupedLighting?.apply(this.scene);
    // Build a nearby radiance probe from the actual road, shops and sky. One
    // cube face is captured per frame, then roughness-filtered for all nearby
    // car paint and glass before the display-resolution pixel regions form.
    // The capture temporarily hides cars, so no vehicle reflects itself.
    if (this.scene.environment) {
      const probePosition = playerPosition.clone();
      probePosition.y += 1.1;
      const reflection = this.localCarReflections.update(this.scene,
        this.cars.map(model => model.group), probePosition, time);
      this.output.dataset.localReflectionReady = String(reflection.ready);
      this.output.dataset.localReflectionGenerations = String(reflection.generations);
    }
    (this.pixelArtActive ? this.pixelArt : this.pass)
      .render(this.scene, this.camera, this.output.width, this.output.height, time);
    this.output.dataset.pixelFinish = String(pixelFinish);
    this.output.dataset.renderStyle = this.pixelArtActive ? 'pixel-art' : this.groupedVisuals ? 'grouped-pixels' : 'cinematic';
    this.output.dataset.groundAsset = this.groundTextures.some(texture => texture.userData.sourceLoadState === 'failed') ? 'failed' : this.groundTextures.every(texture => {
      const image = texture?.image as HTMLImageElement | undefined;
      return image && image.complete !== false && (image.naturalWidth ?? image.width) > 0 && (image.naturalHeight ?? image.height) > 0;
    }) ? 'detailed' : 'loading';
    this.output.dataset.renderer = 'webgl-3d';
    this.output.dataset.sceneMeshes = String(this.renderer.info.memory.geometries);
  }
}

export function getRaceWorld(canvas: HTMLCanvasElement): RaceWorld | null {
  if (worlds.has(canvas)) return worlds.get(canvas)!;
  let world: RaceWorld | null = null;
  try { world = new RaceWorld(canvas); }
  catch (error) { console.warn('3D renderer unavailable; using the compatibility renderer.', error); canvas.dataset.renderer = 'canvas-compatibility'; }
  worlds.set(canvas, world); return world;
}
