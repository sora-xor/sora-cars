import * as THREE from 'three';

type Stops = readonly THREE.Vector3[];
/** Display sRGB (not colour-managed): the race path converts it in the shader. */
const displayStops = (...hex: string[]): Stops =>
  hex.map(value => new THREE.Vector3(...[1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255)));

// Race sky keyframes, authored as DISPLAY sRGB measured from the cutscene art
// (tmp/pixel-art/research/style-spec.txt, sky_rules), horizon -> zenith at
// RACE_STOP_ELEVATIONS. The stops are spread over the chase view's ~0-24 deg
// opening, so the pixel-art quantizer posterizes them into 6-8 bands with a
// constant high chroma (0.13-0.16) through the whole dusk hue rotation.
/** Elevations (rad) of the nine stops; the zenith colour holds above the last. */
const RACE_STOP_ELEVATIONS = [0, .035, .075, .12, .165, .21, .26, .32, .40] as const;
/** Night skies, one per mood. */
export type RaceNightSky = 'city' | 'mountain' | 'harbor';
const RACE_NIGHTS: Readonly<Record<RaceNightSky, Stops>> = {
  /** Tokyo's early chapters: navy-indigo over a plum-magenta city glow at the horizon, under which the night's clouds
   * catch pink (refine round 4, the user's rain-night target, whose sky measures OKLab hue 271-274 at L .21-.24; the
   * upper stops moved from violet, h 280-286, toward it). Chroma is authored ~.015 above the art so the pixel
   * grade's dark-chroma compression lands on indigo, not a grey navy. */
  city: displayStops('#5a2a66', '#47245e', '#362056', '#2a1c50', '#1d1b4e', '#181a4c', '#141748', '#111444', '#0e1240'),
  /** Hakone: the saturated violet-indigo of radio-wide (#2b2580 .. #402e8e) and the blackout door; refine round 4 a step
   * darker and less saturated toward its zenith, as the cutscene-style repaint of a Hakone race frame paints it (the
   * race sky measured OKLab chroma 0.157 against the repaint's 0.113). */
  mountain: displayStops('#42318c', '#3c2e88', '#362a83', '#30267d', '#2b2277', '#271f71', '#231c6a', '#1f1963', '#1c165d'),
  /** Yokohama: harbor-wide's dark navy-plum (#0f133c at the top, #281e45 over the water), chroma lifted as above. */
  harbor: displayStops('#2d1d4d', '#281b4b', '#231949', '#1f1747', '#1c1646', '#191445', '#151243', '#121042', '#0f0f40'),
};
/** Dusk away from the sun: garage-wide (#353495 .. #b45093) over confession's vermilion (#c84b54, #d1574b). */
const RACE_DUSK_AWAY = displayStops('#d1574b', '#c84b54', '#b45093', '#984899', '#6f3f9c', '#653fa3', '#4b39a1', '#3c36a2', '#353495');
/** Dusk toward the sun: beat-confession (#282278 .. #923b6a .. #e05546), warmer and deeper. */
const RACE_DUSK_TOWARD = displayStops('#e2604a', '#d6574b', '#c84b54', '#a84468', '#8a3a72', '#6e3478', '#562d7c', '#45287c', '#362a8a');
/** Sunrise: rose and violet on the far side of the sky ... */
const RACE_SUNRISE_AWAY = displayStops('#ec9a7c', '#e58c7e', '#d88084', '#c7758b', '#b26c93', '#9a639b', '#8059a2', '#6a52a6', '#574aa0');
/** ... and sunrise-wide (#e38374 .. #fdb164) toward the sun. */
const RACE_SUNRISE_TOWARD = displayStops('#fdb865', '#fdb164', '#fcaa65', '#fb9c65', '#f3906b', '#ec8b72', '#e68676', '#df8078', '#d67a7c');
const RACE_STOPS = RACE_STOP_ELEVATIONS.length;
const glslFloat = (value: number) => value.toFixed(4);

/**
 * Race cloud strata, low to high. layer: x altitude (rad), y half thickness
 * (rad), z base lattice columns per turn (even, so every octave wraps the
 * azimuth without a seam), w base lattice rows per radian. shape: row
 * multipliers of the second and third octaves (smaller = rounder lobes; the
 * columns double each octave). tone -1: darker violet masses with lit pink
 * undersides (garage-wide); +1: lit pink/coral strata on violet
 * (beat-confession). Base lobes are 10-40 art cells wide and 2.5-5 times
 * wider than tall on the 315-row art grid.
 */
const RACE_STRATA = [
  { layer: [.020, .014, 128, 190], shape: [2.2, 4.4], seed: 37, coverage: .50, tone: -1, day: false },
  { layer: [.066, .030, 96, 80], shape: [1.8, 3.6], seed: 11, coverage: .55, tone: -1, day: false },
  { layer: [.128, .032, 80, 75], shape: [2, 4], seed: 23, coverage: .50, tone: 1, day: false },
  { layer: [.205, .055, 56, 27], shape: [1.6, 3.2], seed: 53, coverage: .56, tone: -1, day: false },
  { layer: [.300, .050, 64, 55], shape: [2, 4], seed: 71, coverage: .40, tone: 1, day: false },
  // Refine round 4: a high mackerel sky (altocumulus) at dusk and sunrise only (`day`), as the cutscene-style repaints
  // fill the whole upper sky with violet masses lit pink and gold from below; the night keeps its clear, starry top.
  { layer: [.420, .085, 156, 70], shape: [2.2, 4.4], seed: 89, coverage: .64, tone: -1, day: true },
  { layer: [.590, .095, 136, 56], shape: [2, 4], seed: 97, coverage: .6, tone: 1, day: true },
] as const;

/** Optional per-mood race sky data (see RaceWorld's moods). */
export interface RacingSkyMood {
  /** Night keyframe used below dusk: Tokyo 'city', Hakone 'mountain', Yokohama 'harbor'. */
  readonly night?: RaceNightSky;
  /** Star density at night, 0 (none) .. 1 (about one star per 600 art cells). */
  readonly stars?: number;
}

/** Visible, direction-anchored paint; keep the HDR environment for illumination. */
export function createPaintedSky() {
  const projectionInverse = new THREE.Matrix4();
  const projection = new THREE.Matrix4();
  const view = new THREE.Matrix4();
  const cameraWorld = new THREE.Matrix4();
  const viewport = new THREE.Vector4();
  const racingPalette = { value: 0 };
  const racingSun = { value: new THREE.Vector3(0, 1, 0) };
  const racingSunrise = { value: 0 };
  // The race pipeline's output operator: exposure > 0 selects the inverse
  // Neutral mapping at that exposure, 0 a plain display clamp. It is set by
  // the owner, not read at draw time, because a pass may draw the scene
  // untone-mapped and apply the pipeline's operator later.
  const toneInverse = { value: 0 };
  // Per-daylight race stops, away from and toward the sun. They depend only
  // on daylight and the mood, so the CPU evaluates them once per change.
  const raceAway = { value: RACE_DUSK_AWAY.map(() => new THREE.Vector3()) };
  const raceToward = { value: RACE_DUSK_AWAY.map(() => new THREE.Vector3()) };
  // x: cloud amount, y: lit-edge warmth toward the sun, z: sunrise palette
  // weight (the cloud brightness cap and sparser popcorn, R3 sunrise sky).
  const raceCloud = { value: new THREE.Vector4(1, .5, 0, 0) };
  // x: star density, y: lowest elevation (rad), z: art cell size in target
  // pixels, w: share of the brightest stars drawn as a 5-cell plus.
  const raceStars = { value: new THREE.Vector4(0, .03, 2, .06) };
  // Harbour night (refine round 1): the far city across the water collapses
  // to a violet skyline with 1-cell amber light dots and a few red crane
  // warning lights at the horizon (harbor-wide), 0 elsewhere.
  const raceHarbor = { value: 0 };
  // Tokyo's night (refine round 4): the cloud deck's undersides catch the city's pink and magenta from below, 0 elsewhere.
  const raceCityGlow = { value: 0 };
  const raceDay = { value: 1 };
  // Tokyo (refine round 4): x 1 draws the far city and a mountain ridge on the horizon, y its windows' lit share.
  const raceCity = { value: new THREE.Vector2(0, 0) };
  const raceSkyline = { value: new THREE.Vector3(1, 1, 1) };
  const raceGolden = { value: 0 };
  let evaluatedDaylight = NaN, evaluatedNight = '', evaluatedStars = NaN;
  // Tokyo's daylight changes every frame: allocation-free.
  const evaluateRacePalette = (daylight: number, night: RaceNightSky, stars: number) => {
    if (daylight === evaluatedDaylight && night === evaluatedNight && stars === evaluatedStars) return;
    evaluatedDaylight = daylight; evaluatedNight = night; evaluatedStars = stars;
    const dusk = THREE.MathUtils.smoothstep(daylight, 0, .45), sunrise = THREE.MathUtils.smoothstep(daylight, .55, 1);
    const nightStops = RACE_NIGHTS[night];
    for (let i = 0; i < RACE_STOPS; i++) {
      raceAway.value[i]!.lerpVectors(nightStops[i]!, RACE_DUSK_AWAY[i]!, dusk).lerp(RACE_SUNRISE_AWAY[i]!, sunrise);
      raceToward.value[i]!.lerpVectors(nightStops[i]!, RACE_DUSK_TOWARD[i]!, dusk).lerp(RACE_SUNRISE_TOWARD[i]!, sunrise);
    }
    // Night skies are nearly flat: a few faint masses. Dusk and sunrise are
    // dense; lit edges turn amber toward the sun, most at sunrise.
    // Tokyo's night keeps a broken deck lit pink by the city from below (refine round 4).
    // Refine round 4: Hakone's and Yokohama's nights keep a broken deck too (their cutscene-style repaints draw soft
    // clouds low over the horizon); it was nearly clear (0.14).
    raceCloud.value.x = THREE.MathUtils.lerp(THREE.MathUtils.lerp(night === 'city' ? 1 : .55, 1, dusk), .9, sunrise);
    raceCloud.value.y = THREE.MathUtils.lerp(THREE.MathUtils.lerp(.3, .6, dusk), 1, sunrise);
    raceCloud.value.z = sunrise;
    // Sparse single-cell stars at night; at dusk only in the upper violet
    // (garage-wide), none at sunrise.
    raceStars.value.x = THREE.MathUtils.clamp(stars, 0, 1.5) * (1 - .6 * dusk) * (1 - sunrise);
    raceStars.value.y = THREE.MathUtils.lerp(.03, .2, dusk);
    raceHarbor.value = night === 'harbor' ? (1 - dusk) * (1 - sunrise) : 0;
    raceCityGlow.value = night === 'city' ? (1 - dusk) * (1 - sunrise) : 0;
    raceDay.value = 1 - (1 - dusk) * (1 - sunrise);
    raceCity.value.set(1, night === 'city' ? (1 - .7 * dusk) * (1 - sunrise) : night === 'harbor' ? (1 - dusk) * (1 - sunrise) : 0);
    // Refine round 4 (the cutscene-style repaints of each course): Hakone's pass ends in tall mountain ridges and no far
    // city; Yokohama's horizon is a dense lit city of towers across the water; Tokyo keeps its low ridge and far city.
    raceSkyline.value.set(night === 'mountain' ? 2.6 : night === 'harbor' ? 1.1 : 1, night === 'mountain' ? 0 : 1, night === 'harbor' ? 1.7 : 1);
  };
  const stopMix = RACE_STOP_ELEVATIONS.map((elevation, i) =>
    `        raceStop[${i}] = mix(skyRaceAway[${i}], skyRaceToward[${i}], sunward * (1. - skyRaceGolden * .4 * ${glslFloat(THREE.MathUtils.smoothstep(elevation, .1, .3))}));`).join('\n');
  const gradient = RACE_STOP_ELEVATIONS.slice(1).map((elevation, i) =>
    `  c = mix(c, raceStop[${i + 1}], smoothstep(${glslFloat(RACE_STOP_ELEVATIONS[i]!)}, ${glslFloat(elevation)}, e));`).join('\n');
  const strata = RACE_STRATA.map(({ layer, shape, seed, coverage, tone, day }) =>
    `        sky = raceStratum(sky, angular, vec4(${layer.map(glslFloat).join(', ')}), vec2(${shape.map(glslFloat).join(', ')}), vec3(${glslFloat(seed)}, ${glslFloat(coverage)}${day ? ' - (1. - skyRaceDay) * .8' : ''}, ${glslFloat(tone)}), cellAngle, pixelAngle, sunward, nearSun);`).join('\n');
  const material = new THREE.ShaderMaterial({
    name: 'SORA painted dusk clouds',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      skyProjectionInverse: { value: projectionInverse },
      skyProjection: { value: projection },
      skyView: { value: view },
      skyCameraWorld: { value: cameraWorld },
      skyViewport: { value: viewport },
      skyRacingPalette: racingPalette,
      skyRacingSun: racingSun,
      skyRacingSunrise: racingSunrise,
      skyNeutralExposure: toneInverse,
      skyRaceAway: raceAway,
      skyRaceToward: raceToward,
      skyRaceCloud: raceCloud,
      skyRaceStars: raceStars,
      skyRaceHarbor: raceHarbor,
      skyRaceCityGlow: raceCityGlow, skyRaceDay: raceDay,
      skyRaceCity: raceCity, skyRaceSkyline: raceSkyline, skyRaceGolden: raceGolden,
    },
    vertexShader: /* glsl */`
      void main() {
        // One oversized background triangle has no internal mesh edges for
        // derivative-based ink or MSAA to pick up. Ray directions come from
        // the camera below, rather than interpolated sphere triangles.
        gl_Position = vec4(position.xy, 1., 1.);
      }
    `,
    fragmentShader: /* glsl */`
      uniform mat4 skyProjectionInverse;
      uniform mat4 skyProjection;
      uniform mat4 skyView;
      uniform mat4 skyCameraWorld;
      uniform vec4 skyViewport;
      uniform float skyRacingPalette, skyRacingSunrise, skyNeutralExposure;
      uniform vec3 skyRacingSun;
      uniform vec3 skyRaceAway[${RACE_STOPS}], skyRaceToward[${RACE_STOPS}];
      uniform vec4 skyRaceCloud;
      uniform vec4 skyRaceStars;
      uniform float skyRaceHarbor;
      uniform float skyRaceCityGlow;
      uniform float skyRaceDay; // 0 at night, 1 from dusk to sunrise: the high mackerel strata
      uniform vec2 skyRaceCity;
      uniform vec3 skyRaceSkyline; // x ridge height (1 Tokyo's), y 1 draws the far city, z its towers' density and height
      uniform float skyRaceGolden; // 0 as authored; 1 in a late-day route's golden hours (RaceWorld): deeper and more saturated
      const float PI = 3.14159265359;

      const vec3 SUN_DISC = vec3(.996, .949, .773), SUN_HALO = vec3(.988, .722, .467), SUN_HALO_OUTER = vec3(.961, .592, .420);
      // Peak ~.95: a bright amber edge that inverts to modest radiance (no
      // wide clean-mode bloom around every cloud).
      const vec3 RIM_AMBER = vec3(.95, .68, .40);
      // Sun-facing rims within ~15 degrees of the sunrise disc may reach cream
      // (#fee59a); every other cloud cell stays below the halo (R3).
      const vec3 RIM_CREAM = vec3(.995, .898, .604);

      float hash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }

      // Periodic azimuth avoids a seam behind the camera. Each octave loses
      // contrast before it becomes subpixel, so an orbit cannot sparkle.
      float pigment(vec2 p, float period) {
        vec2 i = floor(p), f = fract(p);
        vec2 s = f * f * (3. - 2. * f);
        float a = hash(vec2(mod(i.x, period), i.y));
        float b = hash(vec2(mod(i.x + 1., period), i.y));
        float c = hash(vec2(mod(i.x, period), i.y + 1.));
        float d = hash(vec2(mod(i.x + 1., period), i.y + 1.));
        float value = mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
        vec2 footprint = fwidth(p);
        return mix(value, .5, smoothstep(.38, 1.2, max(footprint.x, footprint.y)));
      }

      float cloudDensity(vec2 angular, float altitude, float breadth,
                         float frequency, float seed) {
        vec2 p = vec2(angular.x * frequency, angular.y * 96.) + vec2(seed, seed * .71);
        // Medium-sized lobes establish the silhouette. A separate slower field
        // groups them into banks without turning a bank into one smooth shape.
        float cluster = pigment(vec2(angular.x * 12. + seed, angular.y * 5. + seed), 12.);
        float drift = (pigment(vec2(angular.x * 16. + seed, seed), 16.) - .5) * breadth * .65;
        float distanceFromBank = (angular.y - altitude - drift) / breadth;
        float lobes = .59 * pigment(p, frequency)
          + .27 * pigment(p * 2. + vec2(7., 1.7), frequency * 2.)
          + .14 * pigment(p * 4. + vec2(19., 4.1), frequency * 4.);
        float body = lobes - .52 + (cluster - .53) * .48
          - distanceFromBank * distanceFromBank * .34;

        // Small marks only disturb an existing edge; they cannot turn the
        // empty sky or a broad cloud interior into an all-over stipple.
        float edgeBrush = pigment(p * 8. + vec2(3., 8.3), frequency * 8.);
        return body + (edgeBrush - .5) * .16 * (1. - smoothstep(.06, .20, abs(body)));
      }

      vec3 clouds(vec3 sky, vec2 angular, float altitude, float breadth,
                  float frequency, float seed, vec3 shadow, vec3 face, vec3 rimColor) {
        vec2 p = vec2(angular.x * frequency, angular.y * 96.) + vec2(seed, seed * .71);
        float field = cloudDensity(angular, altitude, breadth, frequency, seed);
        float edgeWidth = max(fwidth(field) * .75, .0035);
        float cloud = smoothstep(-edgeWidth, edgeWidth, field);

        // Pink belongs to selected lower silhouettes, not every density
        // fluctuation inside a cloud. The neighbouring sample must be sky.
        float lowerField = cloudDensity(angular - vec2(0., .0026), altitude, breadth, frequency, seed);
        float lowerSky = 1. - smoothstep(-edgeWidth, edgeWidth, lowerField);
        float brokenLight = pigment(p * vec2(1., 2.4) + vec2(4.2, 8.6), frequency);
        float rim = lowerSky * cloud * smoothstep(.38, .66, brokenLight);
        float broadStroke = .62 * pigment(p + vec2(2.1, 4.3), frequency)
          + .38 * pigment(p * 2. + vec2(5.3, 1.6), frequency * 2.);
        float plane = smoothstep(.36, .43, broadStroke);
        float glaze = smoothstep(.59, .66, broadStroke);
        vec3 paint = mix(shadow, face, plane * .66);
        paint = mix(paint, face * 1.12, glaze * .32);
        paint = mix(paint, rimColor, rim * .78);

        // A few discontinuous lit dabs break the rim into hand-painted marks.
        float dab = pigment(p * vec2(4., 8.) + 13., frequency * 4.);
        paint = mix(paint, rimColor * 1.09, rim * smoothstep(.61, .72, dab) * .45);
        return mix(sky, paint, cloud);
      }

      vec3 toLinear(vec3 color) {
        return mix(color / 12.92, pow((color + .055) / 1.055, vec3(2.4)), step(vec3(.04045), color));
      }

      // Inverse of the race's single tone map (THREE.NeutralToneMapping,
      // RACE_TONE_MAPPING in cinematic.ts, at the renderer's exposure),
      // ignoring its small highlight desaturation. Authored display colours
      // therefore reach the screen unchanged, and display values near 1
      // become HDR radiance that still blooms (the sun disc, stars).
      vec3 raceRadiance(vec3 display) {
        vec3 color = min(toLinear(max(display, vec3(0.))), vec3(.995));
        if (skyNeutralExposure <= 0.) return color;
        float peak = max(color.r, max(color.g, color.b));
        if (peak > .76) color *= (.0576 / (1. - peak) + .52) / peak;
        float floorLevel = min(color.r, min(color.g, color.b));
        color += floorLevel < .04 ? .4 * sqrt(floorLevel) - floorLevel : .04;
        return color / skyNeutralExposure;
      }

      vec3 toDisplay(vec3 linear) {
        vec3 c = max(linear, vec3(0.));
        return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(vec3(.0031308), c));
      }
      // OKLab of a display colour and back: the palette's colour space.
      vec3 displayOklab(vec3 display) {
        vec3 c = toLinear(clamp(display, 0., 1.));
        vec3 lms = pow(max(vec3(dot(c, vec3(.4122214708, .5363325363, .0514459929)),
          dot(c, vec3(.2119034982, .6806995451, .1073969566)),
          dot(c, vec3(.0883024619, .2817188376, .6299787005))), vec3(0.)), vec3(1. / 3.));
        return vec3(dot(lms, vec3(.2104542553, .7936177850, -.0040720468)),
          dot(lms, vec3(1.9779984951, -2.4285922050, .4505937099)),
          dot(lms, vec3(.0259040371, .7827717662, -.8086757660)));
      }
      vec3 oklabDisplay(vec3 lab) {
        vec3 lms = vec3(lab.x + .3963377774 * lab.y + .2158037573 * lab.z,
          lab.x - .1055613458 * lab.y - .0638541728 * lab.z,
          lab.x - .0894841775 * lab.y - 1.2914855480 * lab.z);
        lms = lms * lms * lms;
        return clamp(toDisplay(vec3(dot(lms, vec3(4.0767416621, -3.3077115913, .2309699292)),
          dot(lms, vec3(-1.2684380046, 2.6097574011, -.3413193965)),
          dot(lms, vec3(-.0041960863, -.7034186147, 1.7076147010)))), 0., 1.);
      }
      // Sunrise clouds stay a palette step below the sun's halo (R3; the halo
      // is L .83, the disc .96): a lighter tone keeps its hue and chroma at the
      // capped lightness, so cream turns peach rather than grey.
      const float SUNRISE_BODY_L = .79, SUNRISE_RIM_L = .82;
      vec3 sunriseCap(vec3 paint, float limit) {
        // Display luma under .66 is well below OKLab L .79: skip the conversion.
        if (skyRaceCloud.z <= 0. || dot(paint, vec3(.2126, .7152, .0722)) < .66) return paint;
        vec3 lab = displayOklab(paint);
        return lab.x <= limit ? paint : mix(paint, oklabDisplay(vec3(limit, lab.yz)), skyRaceCloud.z);
      }
      // The direction through the centre of this pixel's art cell: shapes
      // decided once per cell (the harbour cranes) get hard single-cell edges
      // in the pixel-art resolve.
      vec3 cellCentreDirection() {
        vec2 cell = floor((gl_FragCoord.xy - skyViewport.xy) / skyRaceStars.z);
        vec2 ndc = (cell + .5) * skyRaceStars.z / skyViewport.zw * 2. - 1.;
        vec4 ray = skyProjectionInverse * vec4(ndc, 1., 1.);
        return normalize((skyCameraWorld * vec4(ray.xyz, 0.)).xyz);
      }

      // ---- race sky ---------------------------------------------------------
      // The nine keyframe stops, mixed toward the sun once per pixel.
      vec3 raceStop[${RACE_STOPS}];

      vec3 raceGradient(float e) {
        vec3 c = raceStop[0];
${gradient}
        return c;
      }

      // Value noise on a lattice that wraps every period columns (azimuth).
      // No derivatives: the strata below branch per pixel.
      float lattice(vec2 p, float period) {
        vec2 i = floor(p), f = fract(p);
        vec2 s = f * f * (3. - 2. * f);
        float x0 = mod(i.x, period), x1 = mod(i.x + 1., period);
        return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), s.x),
          mix(hash(vec2(x0, i.y + 1.)), hash(vec2(x1, i.y + 1.)), s.x), s.y);
      }

      // Positive inside a stratum: three octaves of horizontally elongated
      // lobes under a vertical envelope that is flatter below than above
      // (flat-bottomed banks with bumpy tops, ragged at 1-4 art cells).
      float stratumField(float azimuth, float elevation, vec4 layer, vec2 shape, float seed, float centre, float coverage) {
        vec2 p = vec2(azimuth * layer.z, elevation * layer.w);
        float v = .5 * lattice(p + vec2(seed, seed * 1.7), layer.z)
          + .3 * lattice(vec2(p.x * 2., p.y * shape.x) + vec2(seed * 2. + 7., 3.1), layer.z * 2.)
          + .2 * lattice(vec2(p.x * 4., p.y * shape.y) + vec2(seed * 4. + 13., 9.7), layer.z * 4.);
        float t = (elevation - centre) / layer.y;
        float body = v + coverage - 1. - (t < 0. ? .5 : .22) * t * t;
        // Scalloped edges: a fourth octave (2-3 art cells) only disturbs the
        // silhouette, never the open sky or a cloud's interior.
        float scallop = lattice(vec2(p.x * 8., p.y * shape.y * 1.8) + vec2(seed * 8. + 29., 4.3), layer.z * 8.);
        body += (scallop - .5) * .12 * (1. - smoothstep(.02, .09, abs(body)));
        // Tokyo's night (refine round 4): the user's rain-night concept draws its deck as wisps, long thin streaks
        // of small clusters with sky between them, not soft masses; a fine octave stretched along the azimuth
        // breaks the interiors into streaks there.
        float wisp = lattice(vec2(p.x * 6., p.y * shape.y * 4.) + vec2(seed * 6. + 41., 2.9), layer.z * 6.);
        return body + skyRaceCityGlow * (wisp - .5) * .3;
      }

      // One stratum (see RACE_STRATA). The lowest ~3 art cells of each mass,
      // where clear sky lies just below, are its lit underside, broken into
      // clusters; the very lowest cell toward the sun is a bright amber edge.
      vec3 raceStratum(vec3 sky, vec2 angular, vec4 layer, vec2 shape, vec3 look,
                       float cellAngle, float pixelAngle, float sunward, float nearSun) {
        if (abs(angular.y - layer.x) > layer.y * 2.6) return sky;
        float seed = look.x;
        // A slow field along the azimuth lifts, thickens and thins the bank.
        float bank = lattice(vec2(angular.x * 9. + seed, seed * .37), 9.);
        float centre = layer.x + (bank - .5) * layer.y * 1.1;
        float coverage = look.y + (bank - .5) * .24 - (1. - skyRaceCloud.x) * .42;
        float field = stratumField(angular.x, angular.y, layer, shape, seed, centre, coverage);
        float width = max(pixelAngle * layer.w * shape.y * .25, .004);
        float cloud = smoothstep(-width, width, field);
        if (cloud <= 0.) return sky;
        float e = angular.y;
        float under = 1. - smoothstep(-width, width,
          stratumField(angular.x, e - cellAngle * (3. + 2. * skyRaceCityGlow), layer, shape, seed, centre, coverage));
        float edge = 1. - smoothstep(-width, width,
          stratumField(angular.x, e - cellAngle, layer, shape, seed, centre, coverage));
        vec2 q = vec2(angular.x * layer.z * 3., e * layer.w * shape.x);
        float clusters = smoothstep(.36, .44, lattice(q + seed * 3., layer.z * 3.));
        // Two body tones in broad patches (posterized cloud shading).
        float tone = smoothstep(.5, .56, lattice(vec2(angular.x * layer.z * 1.5, e * layer.w * .8) + seed * 5., layer.z * 1.5));
        // At night the masses stay one step off the sky in the indigo family.
        // Deeper at sunrise (refine round 4: the sunrise repaints' cloud bodies are dark violet against bright edges).
        float depth = mix(.93, .72, skyRaceCloud.x) * mix(1., .8, skyRaceCloud.z);
        vec3 body, lit;
        if (look.z < 0.) {
          // Darker violet masses from higher in the gradient; their lit
          // undersides take the pink/vermilion of the lower sky.
          body = raceGradient(e + .14) * mix(depth, depth * 1.12, tone);
          lit = raceGradient(e - .07) * 1.02;
        } else {
          // Lit strata, lighter and pinker than the sky, deeper in their
          // cores; coral/orange undersides.
          body = mix(raceGradient(e - .09) * mix(1.03, .96, tone), raceGradient(e + .03) * (depth + .18), smoothstep(.07, .14, field));
          lit = raceGradient(e - .16) * 1.08;
        }
        // Sunrise and late afternoon (refine round 4: community-dawn and every cutscene-style repaint of a race frame):
        // violet masses a step lighter than the sky behind them, their lit undersides pink and orange; deepened, they
        // read as grey-brown smudges on the peach, and lit coral whole they washed the sky out.
        body = mix(body, body * 1.3 + vec3(.03, 0., .04), skyRaceCloud.z);
        lit = mix(body, lit, skyRaceCloud.x);
        // Sunrise edges more saturated (refine round 4).
        lit = max(mix(vec3(dot(lit, vec3(.3, .59, .11))), lit, 1. + .35 * skyRaceCloud.z), 0.);
        // Tokyo's night: undersides lit pink and magenta by the city, strongest low over the street; the masses
        // a step lighter plum, so the deck reads as lit cloud bands rather than dark smudges.
        lit = mix(lit, vec3(1., .3, .5) * (1. - .5 * smoothstep(.08, .32, e)), skyRaceCityGlow);
        body = mix(body, body * 1.6 + vec3(.07, .02, .05) * (1. - smoothstep(.1, .3, e)), skyRaceCityGlow * smoothstep(-.02, .06, field));
        // Low over the street the city lights whole masses from below, not only their lowest cells (refine round 4:
        // the cutscene-style repaint's horizon clouds are red-magenta streaks, its higher ones blue-grey).
        float lowLit = skyRaceCityGlow * .85 * (1. - smoothstep(.05, .17, e)) * smoothstep(.3, .5, lattice(q * .5 + seed * 7., layer.z * 1.5));
        vec3 paint = sunriseCap(mix(body, lit, max(under * clusters, lowLit)), SUNRISE_BODY_L);
        // Toward the sun the lit edge turns amber (peach and gold at sunrise);
        // only near the sunrise disc may it reach cream.
        vec3 amber = mix(lit * 1.1, mix(RIM_AMBER, RIM_CREAM, nearSun), skyRaceCloud.y);
        amber = sunriseCap(amber, mix(SUNRISE_RIM_L, 1., nearSun));
        // A late-day route's golden hours light the whole underside toward the sun, not only its lowest cell (refine
        // round 4: the repaints' clouds there are broad orange-gold undersides).
        paint = mix(paint, amber, max(edge, under * .75 * skyRaceGolden) * clusters * sunward * skyRaceCloud.y);
        // Away from the sun the low light catches the undersides' faces, coral (the popcorn lobes' front light, below).
        paint = mix(paint, vec3(1., .58, .42) * .95, under * .6 * skyRaceGolden * (1. - sunward) * (1. - sunward) * clusters * skyRaceCloud.y);
        return mix(sky, paint, cloud * min(1., skyRaceCloud.x * 1.5));
      }

      // Popcorn cumulus (refine round 1; dusk and sunrise): clusters of small
      // rounded lobes 2-6 art cells wide and about half as tall, separated by
      // 1-3 cell gaps of the band colour, as the cutscene skies (garage-wide,
      // sunrise-wide, community) are covered in them. A fixed direction lattice
      // (512 columns per turn, 180 rows per radian: ~3.5 x 1.6 art cells at
      // 1080p; never tied to the art cell, so a speed-driven FOV change cannot
      // re-roll it), one lobe per lattice cell where a slow field groups them.
      // Positive inside: 1 - the nearest lobe's normalised distance.
      float popcornField(vec2 angular, out float lobeHash) {
        vec2 q = vec2(angular.x * 512., angular.y * 180.);
        vec2 base = floor(q);
        float best = 9.;
        lobeHash = 0.;
        float sparse = skyRaceCloud.z;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 id = base + vec2(float(i), float(j));
          vec2 wrapped = vec2(mod(id.x, 512.), id.y);
          float group = lattice(vec2(id.x / 8., id.y / 3.) + 5.3, 64.);
          float lift = (id.y + .5) / 180.;
          float band = smoothstep(.012, .04, lift) * (1. - smoothstep(.42, .62, lift));
          float keep = band * smoothstep(.35, .6, group) * .9;
          if (sparse > 0.) {
            // Sunrise (R3; sunrise-wide): the low sky is smooth strata (no
            // popcorn under ~4 degrees), the halo's strata keep the sky
            // around the disc (a quarter of the clusters within ~8 degrees,
            // all by ~16), and beyond ~20 degrees from the sun the clusters
            // thin to half. Decided per lobe, never cutting one.
            float turn = ((wrapped.x + .5) / 512. - .5) * 2. * PI;
            vec3 lobe = vec3(sin(turn) * cos(lift), sin(lift), -cos(turn) * cos(lift));
            float fromSun = acos(clamp(dot(lobe, skyRacingSun), -1., 1.));
            // Refine round 4: a third of that thinning; the cutscene-style repaints fill the sunrise sky with puffs.
            keep *= mix(1., smoothstep(.05, .09, lift) * mix(.25, 1., smoothstep(.14, .28, fromSun))
              * (1. - .5 * smoothstep(.31, .4, fromSun)), sparse * .35);
          }
          if (hash(wrapped * 1.31 + 2.7) > keep) continue;
          vec2 centre = id + .2 + .6 * vec2(hash(wrapped + 7.1), hash(wrapped + 1.9));
          float radius = mix(.5, .85, hash(wrapped + 4.4));
          float d = length(q - centre) / radius;
          if (d < best) { best = d; lobeHash = hash(wrapped + 11.3); }
        }
        return 1. - best;
      }
      vec3 racePopcorn(vec3 sky, vec2 angular, float cellAngle, float sunward, float nearSun) {
        float amount = smoothstep(.3, .8, skyRaceCloud.x);
        if (amount <= 0. || angular.y < .008 || angular.y > .36) return sky;
        float lobeHash;
        float field = popcornField(angular, lobeHash);
        if (field <= 0.) return sky;
        float lowerHash;
        bool edge = popcornField(angular - vec2(0., cellAngle), lowerHash) <= 0.;
        float e = angular.y;
        // Half the clusters lit (warmer, lighter), half in shade (a step
        // darker from higher in the gradient): one palette step off the band.
        // (Refine round 2: the lit bodies from lower and pinker in the
        // gradient, so dusk clusters read as filled pink lobes, not ribbons.)
        // At sunrise (R3) the lit bodies come from just below in the gradient
        // without a lift, within a band of the sky, and stay under the halo.
        // Refine round 4: at sunrise the lit lobes come from well below in the gradient (orange and gold) and the shaded
        // ones from above it (violet), as the cutscene-style repaints contrast them; a band apart they read as haze.
        vec3 litBody = mix(mix(sky, raceGradient(e - .09) * 1.07, .82), mix(sky, raceGradient(e - .14) * 1.04, .85), skyRaceCloud.z);
        vec3 shadeBody = mix(mix(sky, raceGradient(e + .08) * .92, .75), mix(sky, raceGradient(e + .13) * .86, .8), skyRaceCloud.z);
        // Golden hours: the lit lobes toward the sun turn amber (refine round 4, the late-day routes' repaints).
        litBody = mix(litBody, RIM_AMBER * 1.04, skyRaceGolden * sunward * sunward * .8);
        // Away from the low sun its light falls on the clouds' faces: coral and orange lobes ahead with the sun behind the
        // camera (refine round 4: Nara's true-sun repaints), where they kept the away gradient's lavender.
        litBody = mix(litBody, vec3(1., .58, .42), skyRaceGolden * (1. - sunward) * (1. - sunward) * .6);
        // Fewer lobes lit at sunrise (refine round 4: the dawn cutscenes' puffs are mostly violet, pink-edged).
        vec3 body = lobeHash < mix(.5, .42, skyRaceCloud.z) ? sunriseCap(litBody, SUNRISE_BODY_L) : shadeBody;
        // The underside cell is lit: pink, turning amber only toward the sun
        // (cream only near the sunrise disc).
        vec3 lit = mix(raceGradient(e - .12) * 1.06, mix(RIM_AMBER, RIM_CREAM, nearSun), sunward * sunward * sunward * skyRaceCloud.y);
        vec3 paint = edge ? sunriseCap(mix(body, lit, .85), mix(SUNRISE_RIM_L, 1., nearSun)) : body;
        return mix(sky, paint, amount);
      }

      // Stars: one per lattice cell at most, on an equal-area direction
      // lattice. A star is drawn into exactly one art cell (the cell its
      // direction projects into), so the pixel-art resolve sees a whole-cell
      // star that steps cell to cell and never splits or flickers. The
      // brightest are a 5-cell plus, a few are 2-cell dashes.
      vec3 raceStars(vec3 sky, float azimuth, float elevation) {
        if (skyRaceStars.x <= 0. || elevation < skyRaceStars.y) return sky;
        // A finer lattice than before (refine round 4: the cutscene-style repaint's night sky is thick with stars).
        const float ROW = .03, COLUMNS = 210.;
        float row = floor(elevation / ROW);
        float columns = max(6., floor(COLUMNS * cos((row + .5) * ROW)));
        float column = floor(azimuth * columns);
        vec2 id = vec2(mod(column, columns), row);
        if (hash(id * 1.37 + 17.1) > skyRaceStars.x * .3) return sky;
        vec2 place = vec2(column, row) + .2 + .6 * vec2(hash(id + 3.7), hash(id + 9.1));
        float theta = (place.x / columns - .5) * 2. * PI, lift = place.y * ROW;
        if (lift < skyRaceStars.y) return sky;
        vec3 star = vec3(sin(theta) * cos(lift), sin(lift), -cos(theta) * cos(lift));
        vec4 clip = skyProjection * vec4(mat3(skyView) * star, 0.);
        if (clip.w <= 0.) return sky;
        vec2 cell = floor((gl_FragCoord.xy - skyViewport.xy) / skyRaceStars.z);
        vec2 starCell = floor((clip.xy / clip.w * .5 + .5) * skyViewport.zw / skyRaceStars.z);
        vec2 d = cell - starCell;
        float reach = abs(d.x) + abs(d.y);
        float kind = hash(id + 5.3);
        // Display colours whose peak (~.965) inverts to a radiance just above
        // the pixel-art emitter threshold: the cleanup keeps the lone cell, but
        // wet-ground reflections do not stretch it into a lamp column.
        vec3 core = kind < .45 ? vec3(.965, .945, .85) : vec3(.93, .92, .965);
        if (kind < .08) core = vec3(.965, .84, .72);
        if (reach < .5) return core;
        if (kind > 1. - skyRaceStars.w && reach < 1.5) return vec3(.56, .52, .82);
        if (kind >= .08 && kind < .14 && d.y == 0. && d.x == 1.) return core * .92;
        return sky;
      }

      // A light at a direction lattice cell, drawn into exactly one art cell
      // (as the stars): true when this pixel is in that cell.
      bool oneCell(float theta, float lift) {
        vec3 dir = vec3(sin(theta) * cos(lift), sin(lift), -cos(theta) * cos(lift));
        vec4 clip = skyProjection * vec4(mat3(skyView) * dir, 0.);
        if (clip.w <= 0.) return false;
        vec2 cell = floor((gl_FragCoord.xy - skyViewport.xy) / skyRaceStars.z);
        vec2 lightCell = floor((clip.xy / clip.w * .5 + .5) * skyViewport.zw / skyRaceStars.z);
        return all(equal(cell, lightCell));
      }
      // The art cell a direction falls in (false behind the camera).
      bool cellOf(float theta, float lift, out vec2 cell) {
        vec3 dir = vec3(sin(theta) * cos(lift), sin(lift), -cos(theta) * cos(lift));
        vec4 clip = skyProjection * vec4(mat3(skyView) * dir, 0.);
        if (clip.w <= 0.) return false;
        cell = floor((clip.xy / clip.w * .5 + .5) * skyViewport.zw / skyRaceStars.z);
        return true;
      }
      // Harbour container cranes (R3; harbor-wide): floodlit lattice gantries
      // instead of round 2's 1-cell wireframe, which read as a "4". Portal
      // legs, sill and boom are trusses 3-5 art cells thick: a dark plum-brown
      // body laced with rust (posts on the thinnest members, zig-zag
      // diagonals on wider ones) between two chords, the chord toward the
      // floodlights (under the boom and sill, the water side of the legs)
      // amber. The A-frame and its stays are 2 cells of shadow with a rust
      // underside, the machinery house carries a row of lit windows, 6-10
      // one-cell lamps hang under the boom, and red warning lights with a
      // small halo sit at the apex and both boom ends. harbor-wide draws its
      // cranes rust-orange (L .40-.45) with amber lit members (L .52-.67), so
      // they stand out over the dark sky rather than as black cut-outs. One
      // crane per 33-degree slot (a few empty), 9-15 degrees tall, so two or
      // three stand over the roadside trees in any chase view, with container
      // stacks at their feet. Shapes are decided per art cell (the cell
      // centre's direction), so every edge is a hard single cell and the
      // lattice is anchored to the crane; lights are exactly one cell, as the
      // stars.
      const float CRANE_SLOTS = 11.;
      const vec3 CRANE_FILL = vec3(.17, .1, .14), CRANE_LACE = vec3(.5, .24, .12), CRANE_LIT = vec3(.78, .4, .15);
      const vec3 CRANE_LAMP = vec3(.975, .82, .55), CRANE_WINDOW = vec3(.82, .52, .24);
      const vec3 WARN_CORE = vec3(.985, .86, .84), WARN_RED = vec3(.88, .24, .22), WARN_DIM = vec3(.42, .11, .17);
      float segmentDistance(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.));
      }
      // A crane's frame (x along the horizon from the portal's centre, the
      // boom reaching toward +x over the water; y above the quay; h the apex
      // height; cell one art cell, rad): the member at a point, 0 none, 1 leg,
      // 2 sill, 3 boom, 4 machinery house. local: along and across the member
      // in cells; halfWidth: its half width in cells.
      float craneMember(vec2 p, float h, float cell, out vec2 local, out float halfWidth) {
        float boom = .62 * h, leg = max(.03 * h, cell * 1.45), girder = max(.028 * h, cell * 1.45);
        local = vec2(0.); halfWidth = 0.;
        float legX = p.x < 0. ? -.2 * h : .2 * h;
        if (abs(p.x - legX) < leg && p.y < boom) { local = vec2(p.y, p.x - legX) / cell; halfWidth = leg / cell; return 1.; }
        if (abs(p.y - .3 * h) < girder * .75 && abs(p.x) < .2 * h) { local = vec2(p.x, p.y - .3 * h) / cell; halfWidth = girder * .75 / cell; return 2.; }
        if (abs(p.y - boom) < girder && p.x > -.42 * h && p.x < 1.02 * h) { local = vec2(p.x, p.y - boom) / cell; halfWidth = girder / cell; return 3.; }
        vec2 house = p - vec2(-.1 * h, boom + girder + .04 * h);
        if (abs(house.x) < .16 * h && abs(house.y) < .045 * h) { local = house / cell; halfWidth = .045 * h / cell; return 4.; }
        return 0.;
      }
      // A truss member's cell: chords along both edges (the one on the litSide
      // of the member, +1 or -1 across, amber), rust lacing inside over the
      // dark body: posts every third cell on a 3-cell member, zig-zag
      // diagonals on wider ones (never a 1-on-1-off checker).
      vec3 craneTruss(vec2 local, float halfWidth, float litSide) {
        float width = max(3., floor(2. * halfWidth + .5));
        float j = clamp(floor(local.y + width * .5), 0., width - 1.), i = floor(local.x);
        if (j == 0.) return litSide < 0. ? CRANE_LIT : CRANE_LACE;
        if (j == width - 1.) return litSide > 0. ? CRANE_LIT : CRANE_LACE;
        float inner = width - 2.;
        if (inner < 1.5) return mod(i, 3.) < .5 ? CRANE_LACE : CRANE_FILL;
        float t = mod(i, 2. * inner), k = j - 1.;
        return (t < inner ? k == t : k == 2. * inner - 1. - t) ? CRANE_LACE : CRANE_FILL;
      }
      float craneStays(vec2 p, float h, float cell) {
        float stay = max(.014 * h, cell);
        float boom = .62 * h;
        vec2 apex = vec2(-.03 * h, h);
        float d = segmentDistance(p, vec2(-.2 * h, boom), apex) - stay * 1.15;
        d = min(d, segmentDistance(p, vec2(.14 * h, boom), apex) - stay * 1.15);
        d = min(d, segmentDistance(p, apex, vec2(.98 * h, boom)) - stay);
        return min(d, segmentDistance(p, apex, vec2(-.4 * h, boom)) - stay);
      }
      // Distance in art cells from this pixel's cell to the cell a direction
      // falls in (far behind the camera).
      float cellsTo(float theta, float lift, vec2 pixel) {
        vec2 cell;
        return cellOf(theta, lift, cell) ? length(cell - pixel) : 99.;
      }
      vec3 raceHarborCranes(vec3 sky, vec3 cellDirection, float quay, float cellAngle) {
        float elevation = asin(clamp(cellDirection.y, -1., 1.)) - quay;
        if (elevation < 0. || elevation > .27) return sky;
        float theta = atan(cellDirection.x, -cellDirection.z);
        vec2 pixel = floor((gl_FragCoord.xy - skyViewport.xy) / skyRaceStars.z);
        float slot = floor((theta / (2. * PI) + .5) * CRANE_SLOTS);
        for (int k = -1; k <= 1; k++) {
          float s = mod(slot + float(k), CRANE_SLOTS);
          if (hash(vec2(s, 31.7)) < .12) continue;
          float centre = ((s + .25 + .5 * hash(vec2(s, 4.1))) / CRANE_SLOTS - .5) * 2. * PI;
          float h = radians(9.) + radians(6.) * hash(vec2(s, 6.7));
          float side = hash(vec2(s, 8.9)) < .5 ? -1. : 1.;
          vec2 p = vec2(side * (mod(theta - centre + PI, 2. * PI) - PI), elevation);
          if (p.x < -.85 * h || p.x > 1.15 * h || p.y > h + 4. * cellAngle) continue;
          float boom = .62 * h, girder = max(.028 * h, cellAngle * 1.45);
          vec3 color = sky;
          bool drawn = false;
          // Container stacks, 0-3 high, on the quay in front of the portal.
          float column = floor((p.x + h) / (.17 * h)), box = max(.04 * h, cellAngle * 2.2);
          float stack = p.x > -.8 * h && p.x < 1.1 * h ? floor(hash(vec2(column, s + 3.1)) * 4.) : 0.;
          if (p.y < stack * box) {
            float level = floor(p.y / box), within = p.y - level * box;
            float tone = hash(vec2(column * 3.7 + level, s));
            color = tone < .3 ? vec3(.36, .16, .14) : tone < .55 ? vec3(.15, .25, .26) : tone < .8 ? vec3(.17, .18, .3) : vec3(.4, .31, .18);
            if (within > box - cellAngle) color = mix(color, vec3(.66, .44, .26), .45);
            else if (within < cellAngle) color *= .55;
            drawn = true;
          } else {
            vec2 local;
            float halfWidth;
            float member = craneMember(p, h, cellAngle, local, halfWidth);
            if (member > 3.5) {
              // The machinery house: a row of lit windows along its middle.
              color = abs(local.y) < .5 && mod(floor(local.x), 3.) < 1. ? CRANE_WINDOW : CRANE_FILL;
              drawn = true;
            } else if (member > .5) {
              // Legs are floodlit on their water side, the sill and boom from below.
              color = craneTruss(local, halfWidth, member < 1.5 ? 1. : -1.);
              drawn = true;
            } else if (craneStays(p, h, cellAngle) < 0.) {
              color = craneStays(p - vec2(0., cellAngle), h, cellAngle) >= 0. ? CRANE_LACE : CRANE_FILL;
              drawn = true;
            }
          }
          // 6-10 one-cell lamps hanging under the boom.
          float lampY = boom - girder - .6 * cellAngle;
          if (abs(p.y - lampY) < 2. * cellAngle) {
            float lamps = 6. + floor(hash(vec2(s, 2.3)) * 5.), from = -.36 * h, spacing = 1.3 * h / (lamps - 1.);
            float i = clamp(floor((p.x - from) / spacing + .5), 0., lamps - 1.);
            if (cellsTo(centre + side * (from + i * spacing), quay + lampY, pixel) < .5) { color = CRANE_LAMP; drawn = true; }
          }
          // Red warning lights at the apex and both boom ends, with a halo.
          for (int w = 0; w < 3; w++) {
            vec2 at = w == 0 ? vec2(-.03 * h, h + 1.2 * cellAngle) : vec2(w == 1 ? 1.02 * h : -.42 * h, boom + girder + cellAngle);
            if (length(p - at) > 3.5 * cellAngle) continue;
            float r = cellsTo(centre + side * at.x, quay + at.y, pixel);
            if (r >= 2.3) continue;
            color = r < .5 ? WARN_CORE : r < 1.2 ? WARN_RED : mix(color, WARN_DIM, .7);
            drawn = true;
          }
          if (drawn) return mix(sky, color, skyRaceHarbor);
        }
        return sky;
      }
      // Harbour night: the far city across the water as a violet skyline of
      // blocky tops up to about 3 degrees with 1-cell amber and pale window
      // dots (R3: denser, and bright enough that the cleanup keeps each lone
      // cell, as the stars), and a few port towers of 4-7.5 degrees with lit
      // window grids and a red aviation light, tall enough to show over the
      // roadside trees; the cranes and container stacks on the quay in front
      // of it, and under the quay a band of dark water glittering with 1-cell-
      // tall amber and pale dashes, densest just under the shore
      // (harbor-wide). Sky cells never grow halos or reflection columns.
      // The harbour's far city (refine round 4: the Yokohama repaints): a dense city of towers across the water, a dozen
      // or more in view, 4-10 degrees tall and several cells wide (44 a turn left three or four thin ones in the chase
      // view). Its skyline top at an azimuth, whether a tower stands there, and whether a window lattice cell is lit.
      const float HARBOR_WATER = .002, HARBOR_TOWERS = 220., HARBOR_COLUMNS = 1500.;
      float harborTop(float azimuth, out bool tower, out float towerId, out float towerTop) {
        float block = floor(azimuth * 420.);
        float tall = step(.3, hash(vec2(block, 3.1)));
        float top = HARBOR_WATER + .002 + (.012 + .04 * hash(vec2(block, 7.3)) * step(.55, hash(vec2(block, 9.1)))) * tall;
        towerId = floor(azimuth * HARBOR_TOWERS); towerTop = HARBOR_WATER + radians(4.) + radians(6.) * hash(vec2(towerId, 5.5));
        tower = hash(vec2(towerId, 12.7)) > .3 && abs(fract(azimuth * HARBOR_TOWERS) - .5) < .26 + .16 * hash(vec2(towerId, 2.2));
        return tower ? max(top, towerTop) : top;
      }
      bool harborLit(float column, float row, bool tower) {
        vec2 id = vec2(mod(column, HARBOR_COLUMNS), row);
        return tower ? mod(row, 2.) < 1. && mod(column, 2.) < 1. && hash(id + 41.7) < .7 * skyRaceHarbor
          : hash(id + 41.7) < .36 * skyRaceHarbor;
      }
      vec3 raceHarborShore(vec3 sky, float azimuth, float elevation, float cellAngle) {
        if (skyRaceHarbor <= 0. || elevation > .28 || elevation < -.014) return sky;
        const float WATER = HARBOR_WATER, TOWERS = HARBOR_TOWERS, columns = HARBOR_COLUMNS;
        float row = floor(elevation / .0032);
        float column = floor(azimuth * columns);
        if (elevation < WATER) {
          // The water mirrors the far city (refine round 4: the repaints draw each lit window's reflection as a broken
          // vertical streak down the bay): the mirrored point above the waterline, stretched over a few rows, broken by
          // the ripples (whole-row dashes, more of them nearer), plus the old scattered glints.
          vec3 water = raceGradient(.03) * .42;
          float below = WATER - elevation, mirror = WATER + below * .55;
          bool tower; float towerId, towerTop;
          float top = harborTop(azimuth, tower, towerId, towerTop);
          float near = smoothstep(.002, .014, below);
          if (mirror < top) {
            float mrow = floor(mirror / .0032);
            bool lit = harborLit(column, mrow, tower) || harborLit(column, mrow + 1., tower) || harborLit(column, mrow - 1., tower);
            float ripple = hash(vec2(floor((column + hash(vec2(row, 5.1)) * 6.) / 6.), row + 23.));
            if (lit && ripple > mix(.15, .5, near))
              water = mix(water, hash(vec2(column, mrow) + 3.3) < .7 ? vec3(.7, .45, .2) : vec3(.7, .66, .58), mix(.8, .55, near));
            else water *= .85;
          }
          float glint = hash(vec2(floor(column / 3.) + row * 7.13, row + 17.));
          float density = mix(.04, .16, 1. - near);
          if (glint < density) water = mix(water, glint < density * .2 ? vec3(.86, .8, .7) : vec3(.66, .42, .23), .7);
          return mix(sky, water, skyRaceHarbor);
        }
        if (elevation < .14) {
          bool tower; float towerId, towerTop;
          float top = harborTop(azimuth, tower, towerId, towerTop);
          if (elevation < top) {
            sky = mix(sky, raceGradient(.03) * .52, skyRaceHarbor);
            // Window dots: one candidate per lattice cell; towers light a grid.
            vec2 id = vec2(mod(column, columns), row);
            bool lit = harborLit(column, row, tower);
            if (lit) {
              float theta = ((column + .5) / columns - .5) * 2. * PI, lift = (row + .5) * .0032;
              if (lift < top && oneCell(theta, lift)) sky = hash(id + 3.3) < .7 ? CRANE_LAMP : vec3(.93, .9, .8);
            }
          } else if (tower && elevation < towerTop + 2. * cellAngle
            && oneCell(((towerId + .5) / TOWERS - .5) * 2. * PI, towerTop + .7 * cellAngle)) {
            sky = mix(sky, WARN_RED, skyRaceHarbor);
          }
        }
        return raceHarborCranes(sky, cellCentreDirection(), WATER, cellAngle);
      }

      // Tokyo's far horizon (refine round 4, the user's rain-night target): a
      // low mountain ridge in violet over the plains, and before it the far
      // city in blocks and towers, its windows 1-cell amber and cream dots
      // after dark and its towers' aviation lights red. Direction-anchored.
      vec3 raceCitySkyline(vec3 sky, float azimuth, float elevation, float cellAngle) {
        if (skyRaceCity.x <= 0. || elevation > .12 * max(1., skyRaceSkyline.x) || elevation < -.016) return sky;
        // The ridge rises and falls along the horizon, over about two thirds of it (all round where it is tall).
        float sector = mix(smoothstep(.35, .55, lattice(vec2(azimuth * 5., 2.3), 5.)), 1., smoothstep(1.4, 2.2, skyRaceSkyline.x) * .75);
        float ridge = (.018 + .05 * lattice(vec2(azimuth * 26., 7.1), 26.) + .016 * lattice(vec2(azimuth * 95., 3.7), 95.)) * sector * skyRaceSkyline.x;
        // A nearer, darker ridge below a farther, paler one where the mountains are tall (Hakone's layered pass).
        float near = (.012 + .03 * lattice(vec2(azimuth * 41., 5.3), 41.)) * sector * max(skyRaceSkyline.x - 1., 0.);
        // Where the mountains are tall, the night sky over them holds the towns' haze (refine round 4: the Hakone
        // repaint sets its dark ridges against a lighter violet glow; at the sky's own navy they were hardly there).
        float tall = smoothstep(1.4, 2.2, skyRaceSkyline.x) * (1. - skyRaceDay);
        sky = mix(sky, sky * 1.7 + vec3(.035, .022, .06), tall * .7 * (1. - smoothstep(.01, .16, elevation)));
        if (elevation < ridge) sky = mix(sky, mix(raceGradient(.05) * mix(.62, .5, tall), sky, .25 * (1. - tall)), skyRaceCity.x);
        if (elevation < near) sky = mix(sky, raceGradient(.04) * mix(.42, .3, tall), skyRaceCity.x);
        if (skyRaceSkyline.y < .5) return sky;
        // The far city: blocks of differing heights, every so often a tower.
        const float TOWERS = 70., columns = 1600.;
        float block = floor(azimuth * 520.);
        float top = -.004 + (.006 + .026 * hash(vec2(block, 7.3)) * step(.35, hash(vec2(block, 9.1))));
        float towerId = floor(azimuth * TOWERS), towerTop = (.035 + .045 * hash(vec2(towerId, 5.5))) * mix(1., 1.35, step(1.2, skyRaceSkyline.z));
        bool tower = hash(vec2(towerId, 12.7)) > 1. - .38 * skyRaceSkyline.z && abs(fract(azimuth * TOWERS) - .5) < .06 + .06 * hash(vec2(towerId, 2.2));
        if (tower) top = max(top, towerTop);
        if (elevation < top) {
          sky = mix(sky, raceGradient(.03) * .4, skyRaceCity.x);
          float row = floor(elevation / .0032), column = floor(azimuth * columns);
          vec2 id = vec2(mod(column, columns), row);
          bool lit = tower ? mod(row, 2.) < 1. && mod(column, 2.) < 1. && hash(id + 41.7) < .6 * skyRaceCity.y
            : hash(id + 41.7) < .34 * skyRaceCity.y;
          if (lit) {
            float theta = ((column + .5) / columns - .5) * 2. * PI, lift = (row + .5) * .0032;
            if (lift < top && oneCell(theta, lift)) sky = hash(id + 3.3) < .7 ? CRANE_LAMP : vec3(.93, .9, .8);
          }
        } else if (tower && skyRaceCity.y > .1 && elevation < towerTop + 2. * cellAngle
          && oneCell(((towerId + .5) / TOWERS - .5) * 2. * PI, towerTop + .7 * cellAngle)) {
          sky = WARN_RED;
        }
        return sky;
      }

      vec3 raceSky(vec3 direction, vec2 angular) {
        float elevation = angular.y;
        vec2 sunFlat = normalize(skyRacingSun.xz + vec2(1e-5, 0.));
        float sunward = smoothstep(-.25, 1., dot(normalize(direction.xz + vec2(1e-5, 0.)), sunFlat));
        // In a late-day route's golden hours the upper sky keeps its violet even toward the sun (refine round 4: its
        // repaints glow orange only low down, the clouds above lit gold against violet).
${stopMix}
        vec3 sky = raceGradient(elevation);
        // Broad, very quiet scumbling in the clear sky (direction-anchored).
        sky += (pigment(vec2(angular.x * 80., elevation * 210.), 80.) - .5) * .012;
        sky = raceStars(sky, angular.x, elevation);
        // One target pixel and one art cell, in radians along the vertical.
        float pixelAngle = 2. / (abs(skyProjection[1][1]) * skyViewport.w);
        float cellAngle = pixelAngle * skyRaceStars.z;
        // Sunrise clouds within ~15 degrees of the disc may keep cream rims.
        float sunAngle = acos(clamp(dot(direction, skyRacingSun), -1., 1.));
        float nearSun = skyRacingSunrise * (1. - smoothstep(.23, .28, sunAngle));
${strata}
        sky = racePopcorn(sky, angular, cellAngle, sunward, nearSun);
        // Below the true horizon is distant atmospheric colour. Real terrain
        // can occlude it with its ordinary depth. (The harbour's water band
        // is drawn over it.)
        sky = mix(raceGradient(.1) * .6, sky, smoothstep(-.018, -.002, elevation));
        sky = raceHarborShore(sky, angular.x, elevation, cellAngle);
        sky = raceCitySkyline(sky, angular.x, elevation, cellAngle);
        // Sunrise: a flat cream disc and a warm, horizontally stretched halo
        // at the key light's direction.
        float haloDistance = length(vec2(sunAngle, (elevation - asin(clamp(skyRacingSun.y, -1., 1.))) * 1.8));
        float glow = clamp(exp(-haloDistance / .16) * .75 + exp(-sunAngle / .035) * .5, 0., 1.);
        // Refine round 2 (sunrise-wide): the halo is orange-peach (#f5976b
        // outside, #fcb877 near the disc) rather than yellow, and broken into
        // horizontal 1-cell strata: whole-row dashes of a few cells, a third of
        // them a step dimmer, direction-anchored like the popcorn clouds.
        if (glow > .02 && skyRacingSunrise > 0.) {
          float row = floor(elevation / max(cellAngle, 1e-5));
          float dash = floor((angular.x * 6.28318531 * cos(elevation) / max(cellAngle, 1e-5) + hash(vec2(row, 3.7)) * 5.) / 5.);
          if (hash(vec2(dash, row + 11.3)) < .34) glow *= .72;
        }
        sky = mix(sky, mix(SUN_HALO_OUTER, SUN_HALO, smoothstep(.35, .9, glow)), glow * skyRacingSunrise);
        sky = mix(sky, SUN_DISC, (1. - smoothstep(.011, .0125, sunAngle)) * skyRacingSunrise);
        // A late-day route's golden hours (refine round 4, its repaints): the low sky toward the sun deep orange-red
        // rather than cream-peach, and the whole sky about 15% more saturated than the authored stops.
        float deep = skyRaceGolden * sunward * (1. - smoothstep(.04, .45, elevation));
        sky *= mix(vec3(1.), vec3(.95, .76, .64), deep);
        sky = clamp(mix(vec3(dot(sky, vec3(.2126, .7152, .0722))), sky, 1. + .15 * skyRaceGolden), 0., 1.);
        return raceRadiance(sky);
      }

      void main() {
        vec2 ndc = ((gl_FragCoord.xy - skyViewport.xy) / skyViewport.zw) * 2. - 1.;
        vec4 viewRay = skyProjectionInverse * vec4(ndc, 1., 1.);
        // Perspective rays use their homogeneous xyz direction. The oblique
        // reflection projection can put its far intersection behind the eye;
        // dividing by that point's negative w would flip the sky direction.
        vec3 direction = normalize((skyCameraWorld * vec4(viewRay.xyz, 0.)).xyz);
        float elevation = asin(clamp(direction.y, -1., 1.));
        float azimuth = atan(direction.x, -direction.z) / (2. * PI) + .5;
        vec2 angular = vec2(azimuth, elevation);

        // Racing draws the mood keyframes, strata and stars. The garage proof
        // keeps its original full-bright palette and clouds.
        if (skyRacingPalette > .5) {
          gl_FragColor = vec4(raceSky(direction, angular), 1.);
          return;
        }

        // The sunset occupies a narrow lower register; the upper opening is
        // saturated blue-violet rather than a white photographic sky.
        vec3 horizon = vec3(.82, .43, .40);
        vec3 rose = vec3(.65, .34, .49);
        vec3 violet = vec3(.34, .28, .57);
        vec3 blue = vec3(.19, .24, .57);
        vec3 sky = mix(horizon, rose, smoothstep(-.014, .015, elevation));
        sky = mix(sky, violet, smoothstep(.008, .064, elevation));
        sky = mix(sky, blue, smoothstep(.045, .21, elevation));

        // Broad, very quiet scumbling in the clear sky. It is tied to sky
        // direction and filtered; there is no animated grain or pixel crawl.
        float scumble = pigment(vec2(azimuth * 80., elevation * 210.), 80.);
        sky += (scumble - .5) * .012;

        sky = clouds(sky, angular, .027, .025, 256., 37.,
          vec3(.30, .23, .47), vec3(.45, .28, .54), vec3(.86, .43, .53));
        sky = clouds(sky, angular, .094, .062, 192., 11.,
          vec3(.23, .21, .46), vec3(.37, .27, .55), vec3(.77, .38, .56));
        sky = clouds(sky, angular, .207, .095, 144., 23.,
          vec3(.19, .20, .43), vec3(.31, .25, .51), vec3(.64, .34, .55));

        // Below the true horizon is distant atmospheric colour. Real terrain
        // and the garage floor can occlude it with their ordinary depth.
        sky = mix(vec3(.19, .22, .37), sky, smoothstep(-.018, -.002, elevation));

        gl_FragColor = vec4(toLinear(clamp(sky, 0., 1.)), 1.);
      }
    `,
  });
  const geometry = new THREE.BufferGeometry();
  // Clockwise from the camera because this is a BackSide background surface.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, -1, 3, 0, 3, -1, 0], 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Painted dusk sky dome';
  mesh.frustumCulled = false;
  // Draw before depth-writing geometry. All lanes of the derivative quads
  // execute, including pixels later covered by distant mountain silhouettes.
  mesh.renderOrder = -1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    // Reflector changes projectionMatrix for its clip plane without updating
    // camera.projectionMatrixInverse. Invert the matrix actually being used.
    projectionInverse.copy(camera.projectionMatrix).invert();
    projection.copy(camera.projectionMatrix);
    view.copy(camera.matrixWorldInverse);
    cameraWorld.copy(camera.matrixWorld);
    renderer.getCurrentViewport(viewport);
    material.uniformsNeedUpdate=true;
  };

  return {
    mesh,
    setEnabled(enabled: boolean) { mesh.visible = enabled; },
    /**
     * Draw after the opaque scene with a depth test at the far plane, so only
     * uncovered (sky) pixels are shaded. The sky writes no depth either way;
     * the garage proof keeps the original draw-first order.
     */
    setDepthOccluded(occluded: boolean) {
      material.depthTest = occluded;
      mesh.renderOrder = occluded ? 1e6 : -1000;
    },
    /** The single tone map the race output applies after this sky. */
    setOutputToneMapping(toneMapping: THREE.ToneMapping, exposure: number) {
      toneInverse.value = toneMapping === THREE.NeutralToneMapping ? Math.max(exposure, 1e-3) : 0;
    },
    /** Target pixels per art cell: stars are drawn as whole cells of this size. */
    setArtCell(pixels: number) {
      raceStars.value.z = Math.max(1, Math.round(Number.isFinite(pixels) ? pixels : 1));
    },
    /** Switch to the race palette. `daylight` runs night (0) -> dusk (~.45)
     * -> sunrise (1); `sun` is the unit direction toward the key light, where
     * a sun disc and glow appear in proportion to `sunrise` (0..1). `mood`
     * selects the night keyframe and the star density. */
    setRacingSky(daylight: number, sun: THREE.Vector3, sunrise: number, mood?: RacingSkyMood) {
      racingPalette.value = 1;
      evaluateRacePalette(THREE.MathUtils.clamp(daylight, 0, 1), mood?.night ?? 'city', mood?.stars ?? .5);
      racingSun.value.copy(sun).normalize();
      racingSunrise.value = THREE.MathUtils.clamp(sunrise, 0, 1);
    },
    /**
     * A late-day street route's golden afternoon, 0 (as authored) .. 1. Refine round 4: every cutscene-style repaint of
     * such a route paints the low sky toward the sun deep orange-red, not cream-peach, and the whole sky about 15% more
     * saturated than the authored stops, while its dusk matches them.
     */
    setRacingGolden(value: number) { raceGolden.value = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0; },
    dispose() { mesh.geometry.dispose(); material.dispose(); },
  };
}
