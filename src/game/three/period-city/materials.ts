import * as THREE from 'three';
import { ManagedTextureLoader } from '../asset-texture-loader';
import { scannedSurface } from '../surfaces';
import { awningAtlas } from './awnings';
import { neonAtlasTexture, signAtlas, VNEON_BOTTOM_V, VNEON_TOP_V } from './signs';
import { HALL_BAY, type CityMaterialKey } from './geometry';
import { sharePavingUniforms } from '../paving-joints';
import { MAPLE_LEAF_GLSL } from '../maple-leaf-glsl';

/**
 * Lighting shared by every city material, set once per frame from the race
 * mood (world.ts). windows: x upper-floor lit share, y emissive gain (0 off),
 * z cool (TV) share of lit homes, w ground-floor (shop) share.
 */
const windows = { value: new THREE.Vector4(0, 0, 0, 0) };
const lamps = { value: 1 };
/** Landmark floodlighting: on with the night's lights, off toward sunrise. */
const flood = { value: 0 };
/** The render clock (seconds) for neon, chasing bulbs and waving banners. */
const time = { value: 0 };
/** The night's sign and shop light (0 by day), which also lights the crowds. */
export const cityNight = { value: 0 };
/** The shops' and street lamps' light at street level, 0 by day to 1 at night (far-lights.ts). */
export const cityGroundLights = { value: 0 };
let neonMaterial: THREE.MeshStandardMaterial | undefined;
export function setPeriodCityTime(seconds: number): void { time.value = seconds; }
let signMaterial: THREE.MeshStandardMaterial | undefined;

export function setPeriodCityLighting(upper: number, ground: number, gain: number, cool: number, signs: number, lampGain: number, floodlights = 0): void {
  flood.value = Math.max(0, floodlights);
  windows.value.set(THREE.MathUtils.clamp(upper, 0, 1), Math.max(0, gain), THREE.MathUtils.clamp(cool, 0, 1), THREE.MathUtils.clamp(ground, 0, 1));
  cityGroundLights.value = THREE.MathUtils.clamp(ground, 0, 1);
  lamps.value = Math.max(0, lampGain);
  // Lit boards stay readable under the night grade's contrast (refine round 4: the concept's signs read in the
  // distance; at full strength their pale grounds washed out to blank cream).
  if (signMaterial) signMaterial.emissiveIntensity = signs * .6;
  if (neonMaterial) neonMaterial.emissiveIntensity = signs * 1.6 + lampGain * .25;
  bannerGlow.value = signs * .12; cityNight.value = Math.max(0, signs);
}

/**
 * Repaint a scan around the vertex pigment: divide out the scan's mean linear
 * RGB. Walls also draw their finish (geometry.ts WALL_PATTERN) as joints at
 * least an art cell wide, gone where the courses would crowd closer than about
 * four cells, each tile a shade apart; and after dark they lose the sky map's
 * ambient light and a little albedo, so the lit windows, signs and lamp light
 * carry the night (the user's rain-night target).
 */
/** The share of direct light (lamps, shops, the moon) walls lose after dark. */
// Refine round 4: .7 (was .45). A street lamp a few metres from a pale wall lit it as a broad beige panel (the moat
// frame's flats, the office frame's entrance), where the repaints keep the walls by a lamp dark.
const wallDirectCut = { value: .7 };
/**
 * The share of direct light walls lose in a late-day route's golden hours (refine round 4): under the low key the pale
 * tile of Nara Sanjō's zakkyo blew out to flat peach (OKLab L median 0.70, 41% of it above 0.7), where its true-sun
 * repaint keeps a warm beige tile grid (0.63, 8%).
 * October 31: half (was a fifth), and the landmarks' floodlit plaster too. The day grade's upper stretch (pixel-art
 * pass.ts contrastLight) lifted that facade back to 0.72, three quarters of it above 0.7, where its two true-sun mockups
 * keep it at 0.64 lit or 0.51 in shade; at half it measures 0.64. The temple wall by Sarusawa-ike (floodlit) went from
 * 0.83 to 0.73 (mockups 0.68-0.70). Half the light is about what the key gives without its golden-hours boost (world.ts
 * GOLDEN_KEY), which is there for the road and verges under the raised stand-in key; so only upright faces lose it, and
 * flat tops (copings, parapets, sills) take the sun as the road does.
 */
/* November 13 (finish pass, round twelve): .65 (was .5). Sanjō's tall blank flanks in the low sun measured L .72, flat
 * cream blocks where the true-light repaint keeps its concrete .52-.64; at .65 they measure .66. Shaded walls and flat
 * tops are unchanged. .5 for A/B captures. */
export const WALL_GOLDEN_CUT = { value: .65 };
const wallGoldenCut = { value: 0 };
/** How far a late-day route's golden hours have come (0-1; world.ts, every frame). */
export function setPeriodCityGolden(golden: number): void {
  wallGoldenCut.value = WALL_GOLDEN_CUT.value * THREE.MathUtils.clamp(golden, 0, 1);
  lanterns.value = lanternGolden.value * THREE.MathUtils.clamp(golden, 0, 1);
  leafShade.value = leafShadeGolden.value * THREE.MathUtils.clamp(golden, 0, 1);
}
/** Leaf shade over a temple's sunlit earthen wall in the golden hours (`tsuiji`): the share of the low key the shade of
 * the crowns takes where it falls (finish pass, November 11, 2026). Every Sarusawa repaint dapples the wall so; its own
 * trees stand behind it in the temple grounds, where they cannot shade its sunlit face. 0 for A/B captures. */
export const leafShadeGolden = { value: .9 };
const leafShade = { value: 0 };
/** The share of the walls' golden-hours cut (WALL_GOLDEN_CUT) a temple's earthen wall takes (finish pass, November 12):
 * dappled by the leaf shade, its sunlit plaster may stand brighter than the town's walls. Sarusawa's true-light repaint
 * paints it golden ochre at OKLab L .68-.72 with violet-brown leaf shadows, where it measured .58-.68 before the shade
 * and .51-.58 with it under the full cut. 1 for A/B captures. */
export const tsuijiGoldenCut = { value: 0 };
/** How much less of the wall the crowns' shade covers (raises its threshold on the crown field; 0 about half). */
export const leafShadeCover = { value: .14 };
/** A lobby's lit share against the ground floors' (glass shader; finish pass, round sixteen): 2 lights every lobby from a
 * ground share of one half. 1 for A/B captures (by seed, as the shops). */
export const lobbyShare = { value: 2 };
/** Rust and lap lines on painted iron sheet (WALL_PATTERN.sheet; wall shader; finish pass, round ten). 0 for A/B captures. */
export const sheetRust = { value: 1 };
/** How far a hall's glazing shows its frame, strip lights and people (glass shader; finish pass, round nine). 0 for A/B
 * captures: the flat amber panes. */
export const hallGlazingDetail = { value: 1 };
/** How far a round lamp's light deepens toward its limb (lamp shader; finish pass, round nine). 0 for A/B captures. */
export const lampLimb = { value: .85 };
/** Fallen leaves' outline (leaf shader; finish pass, round nine): 1 a maple leaf, 0 the plain diamond for A/B captures. */
export const fallenLeafShape = { value: 1 };
/** Stone lanterns' fireboxes (lamp mode 3) in the golden hours, against the night's lamps (1): the finish pass, as the
 * late-afternoon repaints of Nara's temple walls light them while the street lamps stay off. At .3 the paper glows
 * amber against the sunlit stone; at .8 it washed out to cream. 0 for A/B captures. */
export const lanternGolden = { value: .3 };
const lanterns = { value: 0 };
/** The nearest street-lamp heads (world xyz; w 1 where a lamp stands) whose spill washes the facades around them. */
export const cityLampHeads = { value: Array.from({ length: 6 }, () => new THREE.Vector4()) };
/** The facades' lamp wash at full night (linear light at a lamp's foot). */
// Refine round 4: .5 (was 1.2). With the lamps every 22 m a head often stands right beside a shop front, and at 1.2 its
// spill turned the whole face a flat saturated orange where the repaints keep the brick and the stall inside legible.
const lampWash = { value: .5 };
/**
 * The city's own glow on every facade after dark (linear light): a cool slate fill. A cutscene-style repaint of a race
 * frame (art/reference/mockups) paints unlit facades as slate-blue tile whose grid reads all over, where ours fell to
 * a flat dark purple in which the grid vanished.
 */
const wallAmbient = { value: new THREE.Vector3(.07, .075, .125) };
/** How far the facades' pigment turns to cool slate after dark (0-1). */
const wallSlate = { value: .9 };
/** The share of their albedo the facades lose after dark. */
const wallNightCut = { value: .6 };
/** Place the street-lamp heads whose light washes the facades beside them after dark (world.ts, every frame). */
export function setPeriodCityLampHeads(heads: readonly THREE.Vector3[]): void {
  cityLampHeads.value.forEach((head, i) => { const at = heads[i]; if (at) head.set(at.x, at.y, at.z, 1); else head.w = 0; });
}
function pigmented(material: THREE.MeshStandardMaterial, mean: readonly [number, number, number], name: string): THREE.MeshStandardMaterial {
  material.name = name;
  material.userData.wallDirectCut = wallDirectCut; material.userData.lampWash = lampWash; material.userData.wallAmbient = wallAmbient; material.userData.wallSlate = wallSlate; material.userData.wallNightCut = wallNightCut;
  material.onBeforeCompile = shader => {
    shader.uniforms.cityNight = cityNight; shader.uniforms.citySheetRust = sheetRust;
    shader.uniforms.cityWallDirectCut = wallDirectCut; shader.uniforms.cityWallGoldenCut = wallGoldenCut;
    shader.uniforms.cityLampHeads = cityLampHeads; shader.uniforms.cityLampWash = lampWash; shader.uniforms.cityGroundLights = cityGroundLights;
    shader.uniforms.cityWallAmbient = wallAmbient; shader.uniforms.cityWallSlate = wallSlate; shader.uniforms.cityWallNightCut = wallNightCut;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float cityPattern; varying float vCityPattern; varying vec3 vCityWorld; varying vec3 vCityWorldNormal;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityPattern = cityPattern;\nvCityWorld = (modelMatrix * vec4(transformed, 1.)).xyz; vCityWorldNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityNight; uniform float cityWallDirectCut; uniform float cityWallGoldenCut; uniform vec4 cityLampHeads[6]; uniform float cityLampWash; uniform float cityGroundLights; uniform vec3 cityWallAmbient; uniform float cityWallSlate; uniform float cityWallNightCut; uniform float citySheetRust;\nvarying float vCityPattern; varying vec3 vCityWorld; varying vec3 vCityWorldNormal;\n'
        + 'float cityWallHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n'
        + 'float cityWallNoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);'
        + ' return mix(mix(cityWallHash(i), cityWallHash(i + vec2(1., 0.)), u.x), mix(cityWallHash(i + vec2(0., 1.)), cityWallHash(i + vec2(1., 1.)), u.x), u.y); }\nvoid main() {')
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', /* glsl */ `
        sampledDiffuseColor.rgb /= vec3(${mean.map(v => v.toFixed(6)).join(', ')});
        // The scan only roughens the pigment now: the finish's joints carry the texture, and a full-strength
        // scan quantised into blotches (refine round 4).
        diffuseColor.rgb *= clamp(mix(vec3(1.0), sampledDiffuseColor.rgb, 0.4), 0.0, 1.6);
        {
          float pattern = floor(vCityPattern + .5);
          vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
          float upright = 1. - abs(dot(normalize(vNormal), up));
          if (pattern > .5 && upright > .5) {
            // x: unit length along the face (0: no upright joints); y: course height (0: no courses); z: stagger; w: joint width (m).
            vec4 unit = pattern < 1.5 ? vec4(.6, .3, .5, .035) : pattern < 2.5 ? vec4(.38, .16, .5, .03) : pattern < 3.5 ? vec4(.32, 0., 0., .03)
              : pattern < 4.5 ? vec4(1.5, 1.2, 0., .045) : pattern < 5.5 ? vec4(.22, .22, 0., .025) : vec4(0., .24, 0., .035);
            vec2 m = vMapUv * 3.;
            float row = unit.y > 0. ? floor(m.y / unit.y) : 0.;
            float along = unit.x > 0. ? (m.x + row * unit.z * unit.x) / unit.x : 0.;
            float dy = unit.y > 0. ? abs(fract(m.y / unit.y + .5) - .5) * unit.y : 1e3;
            float dx = unit.x > 0. ? abs(fract(along + .5) - .5) * unit.x : 1e3;
            // Joints at least one art cell wide (the scene renders about 2.5 samples per cell), so they survive the
            // cell resolve as pixel-art courses; gone where the courses would fall closer than about 4 cells.
            float cell = max(fwidth(m.x), fwidth(m.y)) * 2.5;
            // Each direction on its own footprint (refine round 4): a facade receding along the street keeps its
            // courses as horizontal lines where its upright joints crowd out (one footprint for both hid the grid).
            float cellX = fwidth(m.x) * 2.5, cellY = fwidth(m.y) * 2.5;
            float fadeY = unit.y > 0. ? 1. - smoothstep(unit.y / 5.5, unit.y / 3.5, cellY) : 0.;
            float fadeX = unit.x > 0. ? 1. - smoothstep(unit.x / 5.5, unit.x / 3.5, cellX) : 0.;
            float jointY = (1. - smoothstep(max(unit.w, cellY * .5), max(unit.w, cellY * .5) + cellY * .4, dy)) * fadeY;
            float jointX = (1. - smoothstep(max(unit.w, cellX * .5), max(unit.w, cellX * .5) + cellX * .4, dx)) * fadeX;
            float joint = max(jointX, jointY);
            float fade = max(fadeX, fadeY);
            float shade = fract(sin(floor(along) * 37.17 + row * 101.31) * 43758.5453) - .5;
            // After dark the grid carries the facade (the user's rain-night concept, whose tile catches the street
            // light): the grout a shade deeper, the tiles further apart, and a lit cell under each course's upper
            // joint where the lamps above catch its edge.
            float dark = clamp(cityNight, 0., 1.);
            float lip = unit.y > 0. ? smoothstep(1. - 2.2 * cell / unit.y, 1. - 1.2 * cell / unit.y, fract(m.y / unit.y)) * (1. - joint) : 0.;
            diffuseColor.rgb *= 1. + (shade * mix(.1, .22, dark) * min(fadeX, max(fadeY, unit.y > 0. ? 0. : 1.)) + lip * .16 * dark * fadeY) - joint * mix(.34, .5, dark);
            // Surface relief (refine round 4, the cutscenes' facades: corrugated sheet, lapped boards), drawn in whole
            // art cells and gone where it would crowd closer than about three cells a period.
            if (pattern > 2.5 && pattern < 3.5) {
              // Corrugated sheet between the seams: a lit crest, its flank, a shadowed valley, ribs 16 cm apart (coarser
              // than real sheet, as the cutscenes draw it, so they read to about 40 m).
              float period = unit.x / 2., t = fract(m.x / period);
              // Stronger after dark, as the tile grid is, so the lamps and shops pick the ribs out of the dark sheet.
              float rib = (t < .28 ? .17 : t < .5 ? .02 : t < .78 ? -.16 : -.03) * mix(1., 1.9, dark);
              diffuseColor.rgb *= 1. + rib * (1. - smoothstep(period / 3.5, period / 2.4, cell));
              // Painted iron sheet (WALL_PATTERN.sheet; finish pass, round ten): the sheets lap every 1.8 m up the wall,
              // a dark line across it, and rust blooms in ragged patches a metre or so across, most along the foot and
              // under each lap, some walls far gone and some nearly clean. A shed's bare flank was one flat grey sheet
              // a fifth of the frame wide at Nikko's start.
              if (vCityPattern - pattern > .12 && citySheetRust > 0.) {
                const float lap = 1.82;
                float band = fract(m.y / lap), fromLap = (1. - band) * lap;
                float broad = 1. - smoothstep(.25, .6, cell);
                // Run-off draws the blooms down the ribs: patches half a metre wide and two tall, frayed rib by rib.
                float bloom = cityWallNoise(m / vec2(.55, 2.1)) * .6 + cityWallNoise(m / vec2(.16, 1.1) + 5.) * .4;
                float gone = cityWallNoise(vCityWorld.xz / 19.);
                float rust = smoothstep(.6, .72, bloom + .3 * (1. - smoothstep(.15, 2.4, m.y)) + .22 * (1. - smoothstep(0., .8, fromLap)) + (gone - .5) * .34);
                // About as light as the paint it eats, so it reads as orange-brown rust and not as soot.
                vec3 oxide = mix(vec3(.3, .115, .04), vec3(.5, .21, .06), cityWallNoise(m * vec2(5.3, 1.7)));
                diffuseColor.rgb = mix(diffuseColor.rgb, oxide * (1. + rib * .6), rust * .55 * broad * citySheetRust);
                diffuseColor.rgb *= 1. - .3 * citySheetRust * (1. - smoothstep(cell * .5, cell * 1.1, min(band, 1. - band) * lap)) * (1. - smoothstep(lap / 6., lap / 3.5, cell));
              }
            } else if (pattern > 5.5) {
              // Lapped boards: each board's lower edge throws a shadow on the one below, the grain runs along it in
              // long streaks, and a knot here and there.
              float fromBottom = fract(m.y / unit.y) * unit.y;
              float shadow = 1. - smoothstep(cell * .9, cell * 1.8, fromBottom);
              float grain = fract(sin(floor(m.x * 1.7 + row * 3.1) * 12.9898 + floor(fromBottom / max(cell, .02)) * 78.233) * 43758.5453);
              float boards = 1. - smoothstep(unit.y / 4., unit.y / 2.5, cell);
              diffuseColor.rgb *= 1. - mix(.34, .5, dark) * shadow * boards + (grain - .5) * mix(.1, .16, dark) * boards;
            }
          }
          if (pattern < .5 && upright > .5) {
            // Plain mortar takes blotchy weathering, broad stains about a metre across (bilinear, so never a grid).
            vec2 q = vMapUv * 3. / vec2(1.1, .8), f = fract(q), i = floor(q);
            f = f * f * (3. - 2. * f);
            float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453), b2 = fract(sin(dot(i + vec2(1., 0.), vec2(12.9898, 78.233))) * 43758.5453);
            float c2 = fract(sin(dot(i + vec2(0., 1.), vec2(12.9898, 78.233))) * 43758.5453), d2 = fract(sin(dot(i + 1., vec2(12.9898, 78.233))) * 43758.5453);
            float stain = mix(mix(a, b2, f.x), mix(c2, d2, f.x), f.y);
            diffuseColor.rgb *= 1. - .14 * smoothstep(.45, .9, stain);
          }
          if (upright > .5) {
            // Grime (refine round 4, the cutscenes' weathered facades): a darker splash band along the foot of every
            // wall, its top edge ragged, and faint vertical streaks of rain run-off fading down from the top.
            vec2 m = vMapUv * 3.;
            float ragged = fract(sin(floor(m.x * 4.) * 91.7) * 43758.5453) * .25;
            float foot = 1. - smoothstep(.35 + ragged, .75 + ragged, m.y);
            float streak = smoothstep(.55, .95, fract(sin(floor(m.x * 2.5) * 37.3) * 43758.5453));
            diffuseColor.rgb *= 1. - .32 * foot - .1 * streak * smoothstep(1.5, 6., m.y) * (.6 + .4 * fract(m.y * .37));
          }
          // After dark the warm tile and mortar lose most of their colour toward a cool slate: the lamps and shops put
          // the warmth back only where they shine. Refine round 4: a cutscene-style repaint of a race frame paints
          // unlit facades indigo-slate (OKLab hue about 285); half desaturated toward grey-brown, ours turned plum.
          float night = clamp(cityNight, 0., 1.);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.3, .55, .15))) * vec3(.8, .86, 1.22), night * cityWallSlate);
          diffuseColor.rgb *= 1. - night * cityWallNightCut;
        }`))
      // At night the dusk sky map's warm band stops lighting the walls (refine round 4): unlit facades fall to dark
      // tile, as in the concept, and only the lamps', shops' and windows' own light stays warm on them.
      // The street lamps light the facades less too: their pools belong to the pavement and road. In the golden hours the
      // low key lights the upright faces less (WALL_GOLDEN_CUT); flat tops take the sun as the road does.
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= 1. - clamp(cityNight, 0., 1.) * .8;
        reflectedLight.indirectDiffuse += diffuseColor.rgb * cityWallAmbient * clamp(cityNight, 0., 1.);
        float goldenCut = cityWallGoldenCut * smoothstep(.35, .65, 1. - abs(normalize(vCityWorldNormal).y));
        reflectedLight.directDiffuse *= 1. - clamp(cityNight, 0., 1.) * cityWallDirectCut - goldenCut;
        // The street lamps' spill on the facades beside them (the user's rain-night concept: the tile around a lamp
        // glows warm while the wall above and between the lamps stays dark). The pools' cones point down and miss
        // the walls a few metres back, so the nearest heads wash the faces turned toward them, over about 9 m,
        // little above the head (a cobra head throws its light down).
        if (cityGroundLights > 0.) {
          float wash = 0.;
          for (int i = 0; i < 6; i++) {
            vec4 head = cityLampHeads[i];
            if (head.w <= 0.) continue;
            vec3 to = head.xyz - vCityWorld;
            float d = length(to);
            wash += max(dot(vCityWorldNormal, to / max(d, 1e-3)), 0.) * pow(max(1. - d / 9., 0.), 2.)
              * clamp(1. - (vCityWorld.y - head.y + .5) / 3.5, 0., 1.);
          }
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1., .7, .42) * min(wash, 1.) * cityLampWash * cityGroundLights;
        }`);
  };
  material.customProgramCacheKey = () => `${name}-v17`;
  return material;
}

/**
 * Window glass. Each pane carries (seed, kind); a stable share of panes glows
 * (warm homes with a few TV-blue, cool fluorescent offices, bright shops),
 * more at night and few toward sunrise. Office panes brighten toward their
 * ceiling lights; home panes soften at the curtain edges.
 */
function glassMaterial(interiors: { readonly texture: THREE.Texture; readonly ready: { value: number } } | null): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .16, metalness: .35, envMapIntensity: 1.3 });
  material.name = 'period-city-window-glass';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityWindows = windows; shader.uniforms.cityNight = cityNight; shader.uniforms.cityHallGlazing = hallGlazingDetail;
    shader.uniforms.cityLobbyShare = lobbyShare;
    shader.uniforms.cityInteriors = { value: interiors?.texture ?? null };
    shader.uniforms.cityInteriorsReady = interiors?.ready ?? { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec2 cityWindow; varying vec2 vCityWindow; varying vec2 vCityPane;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityWindow = cityWindow; vCityPane = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec4 cityWindows; uniform float cityNight; uniform float cityHallGlazing; uniform float cityLobbyShare; uniform sampler2D cityInteriors; uniform float cityInteriorsReady;\nvarying vec2 vCityWindow; varying vec2 vCityPane;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        float seed = vCityWindow.x, kind = vCityWindow.y;
        float hall = step(4.5, kind), lobby = step(3.5, kind) * (1. - hall);
        // Lobbies light with the shops (refine round 4): every office repaint's ground floor is a lit glass hall, where at
        // 60% lit with a dim room Horikawa's office stood dark at street level.
        // A lobby lights whenever the ground floors do (finish pass, round sixteen): by its seed alone, a quarter of them
        // stood unlit at sunrise and a third at dusk, each a dark mirror metres high between lit ones (Mitsui Bussan's front
        // on Tokyo's sunrise frame), where every repaint lights its lobbies.
        float share = lobby > .5 ? min(1., cityWindows.w * cityLobbyShare) : kind > 1.5 ? cityWindows.w : kind > .5 ? min(1., cityWindows.x * 1.2) : cityWindows.x;
        if ((kind < 2.5 || kind > 3.5) && cityWindows.y > 0. && seed < share) {
          float level = fract(seed * 7.31 + .37), hue = fract(seed * 13.71 + .11);
          vec2 pane = vCityPane;
          // As the concept paints them: a window small on screen is warm light with one clear silhouette in it (a
          // plant on the sill, someone at a desk, a lamp, drawn curtains); only a window large on screen (a shop
          // front, a near window) shows its whole room from the interiors atlas, which shrunk to a few cells turned
          // to noise. The blend follows how many scene pixels the pane spans.
          float spanned = 1. / max(fwidth(pane.x), 1e-4), shopGlass = kind > 1.5 ? 1. : 0.;
          // Refine round 4: a shop front shows its room from 16 scene pixels across (was 40-90): half mixed with the
          // flat glow, a near shop front read as an orange fog over a faint room, where the repaints draw the stall,
          // its counter and the people inside; a lobby's glass is as broad. A window shows its room from 40 (was 150,
          // then 70): the repaints' office windows show desks, plants and people, where ours showed a big white
          // ceiling-lamp oval.
          float room = cityInteriorsReady > .5 && hall < .5 ? smoothstep(shopGlass > .5 ? 16. : 40., shopGlass > .5 ? 40. : 80., spanned) : 0.;
          // The light: warm amber, brighter under the ceiling; some offices fluorescent; some homes lit by the TV.
          // Refine round 4: deeper amber (was 1, .5-.64, .18-.34): every repaint's lit windows measure OKLab chroma
          // about .15, where ours read cream (.08).
          vec3 warm = level < .4 ? vec3(1., .4, .11) : level < .8 ? vec3(1., .46, .15) : vec3(1., .53, .21);
          // Offices sometimes a paler fluorescent, still warm (the concept has no blue-white panes); a few homes the TV's blue, dimmer.
          // Refine round 4: the office tone warmer still, as a cutscene-style repaint keeps every window amber.
          vec3 tone = kind > .5 && kind < 1.5 && hue < .3 ? vec3(1., .58, .3) : kind < .5 && hue < cityWindows.z * .5 ? vec3(.4, .45, .9) * .7 : warm;
          // Held under the tone map's shoulder, so the light stays amber and the silhouettes stay dark against it.
          // A shop front's flat glow at .2 (refine round 4; was .5): over the room seen through it, it read as an
          // orange fog, where the repaints draw the stall and the people inside at a lamp-lit middle tone.
          vec3 glow = tone * mix(.4, .72, smoothstep(.0, .9, pane.y)) * (kind > 1.5 ? .2 : .55);
          float style = fract(seed * 23.7), side = fract(seed * 41.3) < .5 ? .28 : .72, silhouette = 0.;
          // A room behind the glass (refine round 4, the cutscene-style repaint's windows): a ceiling lamp, a bright
          // oval near the top of one sash with its light spread round it, and the room darker toward the floor.
          vec3 overlay = vec3(0.);
          float overlayMask = 0.;
          if (lobby < .5 && kind < 1.5) {
            vec2 lamp = vec2(fract(seed * 3.1) < .5 ? .26 : .74, .84);
            float spread = exp(-dot((pane - lamp) * vec2(2.2, 3.2), (pane - lamp) * vec2(2.2, 3.2)) * 6.);
            glow = glow * mix(.5, 1., smoothstep(.0, .38, pane.y)) + tone * .32 * spread;
            float core = step(length((pane - lamp) * vec2(1., 2.4)), .085);
            overlay = mix(overlay, vec3(1., .86, .62) * .95, core); overlayMask = max(overlayMask, core);
          }
          if (lobby < .5 && kind < 1.5) {
            if (style < .42) {
              // Potted plants on the sill (refine round 4): green leaves, lighter on top where the room's lamp catches
              // them, over a terracotta pot, as the repaint draws them; a second pot on some windows.
              for (int k = 0; k < 2; k++) {
                float px = k == 0 ? side : 1. - side;
                if (k == 1 && fract(seed * 7.7) < .55) break;
                float pot = step(abs(pane.x - px), .055) * step(pane.y, .12);
                float leaves = max(max(step(length((pane - vec2(px, .25)) * vec2(1., 1.3)), .11),
                  step(length((pane - vec2(px - .07, .33)) * vec2(1.3, 1.)), .065)), step(length((pane - vec2(px + .06, .31)) * vec2(1.3, 1.)), .06));
                // Lacy, not a blob: a few cells of the crown let the room show through.
                float speck = fract(sin(dot(floor(pane * 18.), vec2(12.9898, 78.233)) + seed * 17.) * 43758.5453);
                leaves *= step(.18, speck);
                vec3 leaf = mix(vec3(.012, .022, .01), vec3(.045, .08, .024), smoothstep(.18, .4, pane.y) * (.5 + .5 * speck));
                overlay = mix(overlay, vec3(.14, .055, .03), pot * (1. - overlayMask)); overlayMask = max(overlayMask, pot);
                overlay = mix(overlay, leaf, leaves * (1. - overlayMask)); overlayMask = max(overlayMask, leaves);
              }
            } else if (style < .56) {
              // Someone at a desk or a table: head and shoulders.
              float x = .32 + fract(seed * 17.1) * .36;
              float head = step(length((pane - vec2(x, .46)) * vec2(1., .9)), .085);
              float body = step(abs(pane.x - x), .17 - pane.y * .15) * step(pane.y, .36);
              silhouette = max(head, body);
            } else if (style < .64) {
              // A standard lamp: its shade glows, its stem dark.
              float shade = step(abs(pane.x - side), .12 - (pane.y - .5) * .3) * step(.5, pane.y) * step(pane.y, .66);
              overlay = mix(overlay, tone * 1.05 + .06, shade * (1. - overlayMask)); overlayMask = max(overlayMask, shade);
              silhouette = step(abs(pane.x - side), .02) * step(pane.y, .5);
            } else if (style < .8) {
              // Curtains drawn to the sides: light fabric with its folds, lit by the room (they were dark bands).
              float cloth = clamp(smoothstep(.21, .15, pane.x) + smoothstep(.79, .85, pane.x), 0., 1.);
              float hue = fract(seed * 5.3);
              vec3 fabric = (hue < .5 ? vec3(1., .7, .4) : hue < .8 ? vec3(1., .52, .42) : vec3(.6, .76, .45))
                * dot(glow, vec3(.3, .5, .2)) * (.8 + .2 * sin(pane.x * 70.));
              overlay = mix(overlay, fabric, cloth * (1. - overlayMask)); overlayMask = max(overlayMask, cloth);
            } else {
              // A sideboard or sofa along the bottom of the room, its top edge catching the lamp.
              float body = step(abs(pane.x - .5), .36) * step(pane.y, .2), top = body * step(.17, pane.y);
              silhouette = body * (1. - top) * .8;
              overlay = mix(overlay, tone * .45, top * (1. - overlayMask)); overlayMask = max(overlayMask, top);
            }
          }
          glow *= 1. - silhouette * .88;
          glow = mix(glow, overlay, overlayMask);
          // The evening sky caught in the upper glass in soft streaks, a little lighter and pinker, as the concept
          // paints its windows; behind the silhouettes, never over them.
          // Fainter after dark (refine round 4): the room, not the glass's glare, carries a night window.
          if (lobby < .5 && kind < 1.5 && pane.y > .58) {
            float band = floor(pane.y * 14.), streak = fract(sin(band * 91.7 + seed * 53.1) * 43758.5453);
            float reach = fract(sin(band * 17.3 + seed * 11.9) * 43758.5453) * .6 + .2;
            if (streak > .45 && abs(pane.x - reach) < .22 + .2 * streak)
              // A lit window keeps little of the dusk sky (refine round 4: at half the street routes' dusk windows read
              // cream, where their repaints glow amber).
              glow = mix(glow, vec3(1., .62, .46) * .62, mix(.18, .08, clamp(cityNight, 0., 1.)) * (1. - silhouette) * (1. - overlayMask));
          }
          if (room > 0.) {
            // The room: offices, homes, eateries and bars, shops (one each by the window's seed), upright from the
            // street; lobbies a bright office (not the room behind blue blinds, which the night grade turned violet
            // across a whole lobby). Bright enough to sit in the highlight range, where the grade keeps it amber; shop
            // fronts, whole walls of glass, a little less so they keep their detail.
            float row = kind > 1.5 && lobby < .5 ? 2. + step(.5, fract(seed * 3.7)) : kind > .5 || lobby > .5 ? 0. : 1.;
            float column = floor(fract(seed * 11.3) * 4.);
            if (lobby > .5 && column == 1.) column = 0.;
            vec2 roomUv = vec2((column + clamp(pane.x, .01, .99)) / 4., 1. - (row + 1. - clamp(pane.y, .01, .99)) / 4.);
            // Refine round 4: a window's room at 1.4 (was 1.9): brighter, it went into the tone map's shoulder.
            vec3 inside = texture2D(cityInteriors, roomUv).rgb * (kind > 1.5 && lobby < .5 ? 1.5 : 1.4);
            // Warmer and a little dimmer before night falls (refine round 4: the office rooms' fluorescent white, lifted by
            // the dusk exposure, read cream, where every repaint keeps its rooms amber).
            inside *= mix(vec3(1.06, .9, .68), vec3(1.), .35 * clamp(cityNight, 0., 1.)) * mix(.75, 1., clamp(cityNight, 0., 1.));
            // A lobby's room amber (refine round 4): its fluorescent office read salmon-pink behind the glass, where
            // the repaints' lobbies glow warm.
            if (lobby > .5) inside *= vec3(1.1, .84, .58);
            glow = mix(glow, inside, room);
          }
          // A hall's glazing (finish pass, round nine): a station concourse, a pachinko parlour or a warehouse floor behind
          // a wall of glass stood as one flat amber slab several metres wide (Hakone-Yumoto's front at the Midnight
          // Circuit's start), where every repaint draws a lit hall through its frame. The pane's bays and height ride in
          // its kind (geometry.ts hallGlazing): mullions between the bays, a transom over the doors and a kick plate;
          // inside, a dim floor under a lit wall, a strip light to each bay under the ceiling, people standing, and
          // ticket barriers or counters. All of it fades to the flat light where a bay spans under a few scene pixels.
          float hallSize = floor((kind - 5.) * 4096. + .5), hallBays = mod(hallSize, 64.), hallTall = floor(hallSize / 64.) * .5;
          if (hall > .5 && hallBays > 0. && cityHallGlazing > 0.) {
            float bx = pane.x * hallBays, my = pane.y * hallTall, bay = floor(bx), fx = fract(bx);
            float detail = smoothstep(4., 10., 1. / max(fwidth(bx), 1e-4)) * cityHallGlazing;
            float h1 = fract(sin(bay * 12.9898 + seed * 78.233) * 43758.5453), h2 = fract(h1 * 17.31 + .37), h3 = fract(h1 * 41.7 + .11);
            vec3 inside = tone * .2 * mix(.42, .9, smoothstep(.15, 1.5, my));
            // The dado: the wall's lower metre a shade darker, as tiled station walls are.
            inside *= mix(.72, 1., smoothstep(.95, 1.02, my));
            // Posters and timetable boards on the back wall of some bays.
            float board = step(.5, h3) * step(abs(fx - .5), .3) * step(abs(my - 1.62), .34);
            inside = mix(inside, tone * mix(.06, .3, step(.75, h3)), board * .8);
            // A fluorescent strip under the ceiling, to each bay.
            float tube = step(abs(fx - .5), .33) * step(abs(my - (hallTall - .42)), .075) * step(1.9, hallTall);
            inside = mix(inside, vec3(1., .92, .74) * .62, tube);
            // Ticket barriers and counters: low dark boxes whose tops catch the light.
            float gate = step(.74, h1) * step(abs(fx - .5), .31) * step(my, .98);
            inside = mix(inside, tone * mix(.035, .3, step(.88, my)), gate);
            // People: one standing in about half the bays, a second, further in, in a few.
            // Each a head, shoulders narrowing to the waist, and two legs, about 1.5-1.75 m tall.
            float sx = (fx - (.26 + h2 * .48)) * ${HALL_BAY.toFixed(2)}, tall = 1.52 + h3 * .24;
            float torso = step(.84, my) * step(my, tall - .26) * step(abs(sx), mix(.16, .235, smoothstep(.9, tall - .34, my)));
            float legs = step(my, .84) * step(abs(abs(sx) - .09), .068);
            float person = step(h1, .56) * max(max(torso, legs), max(step(length(vec2(sx, my - (tall - .115))), .115),
              step(abs(sx), .05) * step(tall - .27, my) * step(my, tall - .2)));
            float sx2 = (fx - (.74 - h3 * .5)) * ${HALL_BAY.toFixed(2)}, tall2 = 1.28 + h2 * .2;
            float behind = step(.3, h2) * step(h2, .62) * max(step(length(vec2(sx2, my - (tall2 - .1))), .1),
              step(abs(sx2), .17) * step(my, tall2 - .17));
            inside *= 1. - .55 * behind * (1. - person);
            inside *= 1. - .9 * person;
            // The frame: mullions between the bays, a transom over the doors of a tall front, the kick plate below.
            float mullion = step(min(fx, 1. - fx), max(.032, fwidth(bx) * .6));
            float transom = step(2.9, hallTall) * step(abs(my - 2.3), max(.045, fwidth(my) * .6));
            float frame = max(max(mullion, transom), step(my, .14));
            inside *= 1. - .92 * frame;
            glow = mix(glow, inside, detail);
          }
          // Every window its cross mullion.
          if (lobby < .5 && kind < 1.5 && (abs(pane.x - .5) < .035 || abs(pane.y - .64) < .03)) glow *= .06;
          // A lit room shows through the glass: no mirror of the dusk sky over it, and its own light carries it.
          metalnessFactor = 0.; roughnessFactor = .9;
          diffuseColor.rgb *= .12;
          totalEmissiveRadiance += glow * cityWindows.y * mix(.7, 1., level);
        }
      }`);
  };
  material.customProgramCacheKey = () => 'period-city-window-glass-v17';
  return material;
}

/** The rooms seen through lit windows (public/assets/sprites/window-interiors.png); `ready` turns 1 once it loads. */
function interiorsTexture(url: string): { texture: THREE.Texture; ready: { value: number } } {
  const ready = { value: 0 };
  const texture = new ManagedTextureLoader().load(url, () => { ready.value = 1; });
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; texture.name = 'SORA period window interiors';
  return { texture, ready };
}

/**
 * Sample a sign's print one mip sharper (refine round 4: the concept's lettering reads in the distance; the trilinear
 * filter blurred a sign 40 m away into a smudge before the art cells could take its strokes). `previous` keeps a
 * material's own shader patch.
 */
function sharpPrints(material: THREE.MeshStandardMaterial, key: string): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, -1. )'))
      .replace('#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment
        .replace('texture2D( emissiveMap, vEmissiveMapUv )', 'texture2D( emissiveMap, vEmissiveMapUv, -1. )'));
  };
  material.customProgramCacheKey = () => key;
}

/** Emitters coloured per vertex: bulbs, lanterns, neon, canopy and vending fronts. */
function lampMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#3a3430', emissive: '#ffffff', roughness: .5 });
  material.name = 'period-city-lamps';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityLamps = lamps; shader.uniforms.cityTime = time; shader.uniforms.cityLanterns = lanterns; shader.uniforms.cityLampLimb = lampLimb;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vLampAnimation;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampAnimation = uv;');
    // Chasing bulbs (pachinko halls, marquees): each bulb's phase runs on the clock.
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityLamps; uniform float cityTime; uniform float cityLanterns; uniform float cityLampLimb; varying vec2 vLampAnimation;\nvoid main() {')
      .replace('vec3 totalEmissiveRadiance = emissive;', `vec3 totalEmissiveRadiance = emissive * vColor.rgb * (vLampAnimation.y > 2.5 ? max(cityLamps, cityLanterns) : cityLamps)
        * (vLampAnimation.y > 2.5 ? 1. : vLampAnimation.y > 1.5 ? .06 + .94 * step(.62, fract(cityTime * .75 - vLampAnimation.x))
          : vLampAnimation.y > .5 ? .18 + .82 * step(.55, fract(cityTime * 1.4 - vLampAnimation.x)) : 1.);
      // A round lamp (geometry.ts ROUND_LAMP: globes, lanterns, drums) is brightest where it faces the eye and deepens
      // to amber toward its limb, so a near globe reads as a lit round body (finish pass, round nine: the shopping
      // streets' globes stood as flat cream discs).
      if (vLampAnimation.x > 1.5 && vLampAnimation.y < .5) {
        float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        // By the square of the facing: a lamp's faces a third of the way round already warm, as its light is far over
        // the display's white and a gentler ramp left all but the last sliver cream.
        totalEmissiveRadiance *= mix(vec3(1.), mix(vec3(.3, .14, .05), vec3(1.), facing * facing), cityLampLimb);
      }`);
  };
  material.customProgramCacheKey = () => 'period-city-lamps-v5';
  return material;
}

/**
 * Neon tube signs: the board's own print as emissive, flickering a little and
 * dropping out now and then. Phase and mode ride in the vertex colour: red is
 * the phase, green the mode (0 steady, 1 blinking, 2 spelled out letter by
 * letter from the left, 3 from the top of a vertical sign), each sign held,
 * flashed and dark before it starts again.
 */
function neonSignMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 0, roughness: .4 });
  material.name = 'period-city-neon';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec3 color; varying vec2 vNeon;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNeon = color.rg;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityTime; varying vec2 vNeon;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        float phase = vNeon.x * 97.;
        float flicker = .9 + .1 * sin(cityTime * 23. + phase);
        float dropout = step(.05, fract(sin(floor(cityTime * 9. + phase) * 12.9898) * 43758.5453));
        float lit = 1.;
        // Mode 4: paper lanterns and lit box signs burn steadily, as lamps do (no tube flicker or dropout).
        if (vNeon.y > 3.5) { flicker = 1.; dropout = 1.; }
        else if (vNeon.y > .5 && vNeon.y < 1.5) lit = step(.3, fract(cityTime * .7 + vNeon.x));
        else if (vNeon.y > 1.5) {
          // Where this texel sits along the sign (0-1), across a horizontal board or down a vertical one.
          float along = vNeon.y > 2.5 ? (${VNEON_TOP_V.toFixed(6)} - vMapUv.y) / ${(VNEON_TOP_V - VNEON_BOTTOM_V).toFixed(6)} : fract(vMapUv.x * 4.);
          float t = fract(cityTime / 3.4 + vNeon.x);
          lit = t < .55 ? step(along, t / .55) : t < .78 ? 1. : t < .84 ? 0. : t < .92 ? 1. : 0.;
        }
        totalEmissiveRadiance *= flicker * mix(1., dropout, .75) * lit;
      }`);
  };
  material.customProgramCacheKey = () => 'period-city-neon-v2';
  return material;
}

/**
 * Cloth banners from the nobori and street-banner cells. The vertex colour
 * carries the phase (red), how the cloth hangs (green: 0 a nobori flying from
 * its pole, 1 a banner hung flat down a facade) and how it is held (blue: 0 a
 * pole at the print's left, 1 at its right, 2 a street banner tied at both
 * ends, whose cells are half the atlas wide). Back faces read the print the right way round,
 * as both sides of a dyed banner do, and a little shop light keeps them
 * legible at night.
 */
const bannerGlow = { value: 0 };
function bannerMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .9 });
  material.name = 'period-city-banners';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityTime = time; shader.uniforms.cityBannerGlow = bannerGlow;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec3 color; uniform float cityTime; varying float vBannerColumns;\nvoid main() {')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
      {
        vBannerColumns = color.b > 1.5 ? 2. : 16.;
        float cell = fract(uv.x * vBannerColumns), hanging = color.g;
        float across = color.b > 1.5 ? sin(3.1416 * cell) : color.b > .5 ? 1. - cell : cell;
        float wave = sin(cityTime * 3.6 + across * 4. + position.x * .7 + position.z * .9 + color.r * 30.);
        transformed += objectNormal * wave * across * mix(.16, .02, hanging);
      }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityBannerGlow; varying float vBannerColumns;\nvoid main() {')
      .replace('#include <map_fragment>', /* glsl */ `
      {
        vec2 bannerUv = vMapUv;
        if (!gl_FrontFacing) bannerUv.x = (floor(bannerUv.x * vBannerColumns) + 1. - fract(bannerUv.x * vBannerColumns)) / vBannerColumns;
        diffuseColor *= texture2D(map, bannerUv);
      }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * cityBannerGlow;');
  };
  material.customProgramCacheKey = () => 'period-city-banners-v3';
  return material;
}

/**
 * Shop awnings (awnings.ts): the cloth takes its vertex colour for the stripes over cream, the shop's word in cream
 * with a dark outline, the valance's scallops cut out; after dark it glows a little, as canvas does with the shop lit
 * behind and under it (refine round 4, the user's rain-night concept).
 */
function awningMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: .85, metalness: 0, alphaTest: .5 });
  material.name = 'period-city-awnings';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityNight = cityNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityNight;\nvoid main() {')
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', /* glsl */ `
      {
        vec4 m = texture2D(map, vMapUv, -1.);
        // The cream a step down and the colour a step deeper, so the stripes still read under a street lamp.
        vec3 cloth = mix(vec3(.7, .62, .47), vColor.rgb * .85, m.r) * mix(.68, 1., m.b);
        vec3 ink = mix(vec3(.09, .04, .04), vec3(.97, .92, .8), smoothstep(.6, .95, m.g));
        diffuseColor.rgb = mix(cloth, ink, smoothstep(.15, .45, m.g));
        diffuseColor.a = m.a;
      }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * clamp(cityNight, 0., 1.) * .25;')
      // As on the walls: after dark the street lamps and the sky map light the cloth less than its own shop does.
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directDiffuse *= 1. - clamp(cityNight, 0., 1.) * .35;\nreflectedLight.indirectDiffuse *= 1. - clamp(cityNight, 0., 1.) * .7;');
  };
  material.customProgramCacheKey = () => 'period-city-awnings-v3';
  return material;
}

/**
 * Floodlit landmark facades: the scanned plaster pigmented per vertex, plus a
 * warm wash on upright faces, brightest at their foot where the floodlights
 * stand and fading up the facade (UV v is metres above the base / 3). In a late-day route's golden hours the low key
 * lights them less, as it does the walls (WALL_GOLDEN_CUT).
 * `leafy` (a temple's earthen wall, `tsuiji`): in the golden hours the crowns' shade dapples the low key on it
 * (leafShadeGolden), in clusters about 3.4 m across of leaves about 0.3-0.8 m with sunlit gaps, anchored in the world.
 */
function floodlitMaterial(leafy = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('beige_wall_001'),
    normalScale: new THREE.Vector2(.8, .8), roughness: .94, metalness: 0 });
  material.name = leafy ? 'period-city-tsuiji' : 'period-city-floodlit';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityFlood = flood; shader.uniforms.cityWallGoldenCut = wallGoldenCut;
    if (leafy) {
      shader.uniforms.cityLeafShade = leafShade; shader.uniforms.cityTsuijiCut = tsuijiGoldenCut; shader.uniforms.cityLeafCover = leafShadeCover;
      sharePavingUniforms(shader);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vTsuijiWorld; varying vec3 vTsuijiNormal;\nvoid main() {')
        .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
  vTsuijiWorld = (modelMatrix * vec4(transformed, 1.)).xyz;
  vTsuijiNormal = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', /* glsl */ `uniform float cityLeafShade; uniform float cityTsuijiCut; uniform float cityLeafCover;
varying vec3 vTsuijiWorld; varying vec3 vTsuijiNormal;
uniform vec2 soraPavingTravel; // the camera's travel per simulation tick (m), shared with the paving joints
float tsuijiHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tsuijiNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(tsuijiHash(i), tsuijiHash(i + vec2(1., 0.)), u.x), mix(tsuijiHash(i + vec2(0., 1.)), tsuijiHash(i + vec2(1., 1.)), u.x), u.y);
}
void main() {`)
        .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
      if (cityLeafShade > 0.) {
        // On the wall's own plane (along it, up it), stretched along it about three times so that, foreshortened as the
        // wall runs away beside the road, crowns' clusters and leaves read round (isotropic, they stood up as figures).
        vec3 n = normalize(vTsuijiNormal);
        vec2 t = normalize(vec2(n.z, -n.x) + vec2(1e-5, 0.)), q = vec2(dot(vTsuijiWorld.xz, t), vTsuijiWorld.y);
        float crown = tsuijiNoise(q / vec2(4.2, 1.5) + 7.) * .7 + tsuijiNoise(q / vec2(1.8, .7) - 3.) * .3;
        // Each leaf octave fades to its mean as it shrinks toward an art cell, so the far wall stays calm, and as the camera's
        // travel per tick nears its length along the wall (as the paving joints do): at race speed the near wall passes
        // a leaf a tick and it strobed (wall flicker 4.69% to 5.17%). Where the leaves fade, the crowns' clusters take
        // their full shade instead, so at speed the wall stays dappled in soft patches a metre or more across.
        vec2 step = fwidth(q);
        float travel = length(soraPavingTravel);
        float leaf = (1. - smoothstep(.25, .6, max(step.x / .5, step.y / .19))) * (1. - smoothstep(.3, .6, travel / .5));
        float vein = (1. - smoothstep(.25, .6, max(step.x / .22, step.y / .09))) * (1. - smoothstep(.3, .6, travel / .22));
        float leaves = mix(.5, tsuijiNoise(q / vec2(.5, .19)), leaf) * .6 + mix(.5, tsuijiNoise(q / vec2(.22, .09) + 13.), vein) * .4;
        float dappled = mix(.95, smoothstep(.42, .54, leaves), max(leaf, vein));
        float shade = cityLeafShade * smoothstep(.33 + cityLeafCover, .52 + cityLeafCover, crown) * dappled * smoothstep(.5, .9, 1. - abs(n.y));
        reflectedLight.directDiffuse *= 1. - shade;
        // In the shade the sky's cool light shows (the repaint's shadows on the wall are violet-brown).
        reflectedLight.indirectDiffuse *= mix(vec3(1.), vec3(.9, .9, 1.12), shade);
      }`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityFlood; uniform float cityWallGoldenCut;\nvoid main() {')
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', /* glsl */ `
        sampledDiffuseColor.rgb /= vec3(0.339758, 0.262138, 0.188094);
        diffuseColor.rgb *= clamp(mix(vec3(1.0), sampledDiffuseColor.rgb, 0.4), 0.0, 1.6);
        {
          // Dressed stone in staggered blocks, its joints drawn while they span an art cell (refine round 4).
          vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
          if (1. - abs(dot(normalize(vNormal), up)) > .5) {
            vec2 m = vMapUv * 3.;
            float row = floor(m.y / .6), along = (m.x + row * .6) / 1.2;
            float d = min(abs(fract(m.y / .6 + .5) - .5) * .6, abs(fract(along + .5) - .5) * 1.2);
            float cell = max(fwidth(m.x), fwidth(m.y));
            float fade = 1. - smoothstep(.1, .26, cell);
            float shade = fract(sin(floor(along) * 37.17 + row * 101.31) * 43758.5453) - .5;
            diffuseColor.rgb *= 1. + (shade * .07 - (1. - smoothstep(.035, .035 + cell, d)) * .24) * fade;
          }
          // As the walls (pigmented): at night the stone loses half its colour toward a cool grey-brown, so the
          // floodlights' warmth reads at the foot and the upper facade stays dark tile.
          float night = clamp(cityFlood * 2., 0., 1.);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.3, .55, .15))) * vec3(.9, .88, 1.08), night * .5);
        }`))
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
        float upright = 1. - abs(dot(normalize(vNormal), up));
        // The floodlights stand at the foot: the wash is brightest on the lower floors and gone by about 16 m,
        // so a landmark reads lit from below against a dark upper facade, not washed orange to the roof.
        float wash = mix(.55, 0., smoothstep(0., 14., vMapUv.y * 3.));
        totalEmissiveRadiance += diffuseColor.rgb * cityFlood * upright * wash * vec3(1., .8, .58);
      }`)
      // As on the walls: after dark the dusk sky map's warm band stops lighting the stone, and in the golden hours the
      // low key lights its upright faces less.
      .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= 1. - clamp(cityFlood * 2., 0., 1.) * .8;
      {
        vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
        float goldenCut = cityWallGoldenCut * smoothstep(.35, .65, 1. - abs(dot(normalize(vNormal), up)));
        reflectedLight.directDiffuse *= 1. - goldenCut${leafy ? ' * cityTsuijiCut' : ''};
      }`);
  };
  material.customProgramCacheKey = () => leafy ? 'period-city-tsuiji-v2' : 'period-city-floodlit-v5';
  return material;
}

/**
 * Fallen maple leaves (street.ts `leaf`; finish pass, round nine). Each leaf is one square whose corners carry the
 * leaf's own coordinates (-1..1, the middle lobe's tip toward +y), and the shader cuts a maple leaf out of it: seven
 * pointed lobes from a point below the middle, the two lowest small, and a stalk. Every autumn repaint strews the road
 * with maple leaves; ours were plain diamonds, which read as confetti. Lit as the ground is, in the leaf's own colour,
 * with a paler midrib to each lobe and a darker half, as a painter folds a leaf. Where a leaf spans too few scene
 * pixels for its lobes it fills out to the old diamond, so the far road's scatter is as it was.
 */
function fallenLeafMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.name = 'period-city-fallen-leaves';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityLeafShape = fallenLeafShape;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vLeaf;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeaf = uv * 2. - 1.;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float cityLeafShape; varying vec2 vLeaf;${MAPLE_LEAF_GLSL}void main() {`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
      {
        // The old diamond, a little smaller than the square: the far leaves, and all of them at cityLeafShape 0.
        float diamond = 1. - abs(vLeaf.y) / .8 - abs(vLeaf.x) / .52;
        vec2 leaf = mapleLeaf(vLeaf);
        float span = max(fwidth(vLeaf.x), fwidth(vLeaf.y));
        // The stalk, while it spans a scene pixel.
        float stalk = step(abs(vLeaf.x), max(.03, span * .5)) * step(-.95, vLeaf.y) * step(vLeaf.y, -.2) * (1. - smoothstep(.05, .09, span));
        float maple = max(leaf.x, stalk - .5);
        // Lobes thinner than an art cell only shimmer: from about ten cells across down to six the leaf fills out.
        float fill = smoothstep(.09, .16, span);
        float inside = cityLeafShape > .5 ? max(maple - 1.5 * smoothstep(.16, .26, span), diamond - (1. - fill) * 1.2) : diamond;
        if (inside < 0.) discard;
        if (cityLeafShape > .5) {
          float fine = 1. - smoothstep(.04, .09, span);
          float rib = (1. - smoothstep(.0, max(.035, span * .7), leaf.y)) * fine;
          diffuseColor.rgb *= (1. + .5 * rib) * mix(1., vLeaf.x > 0. ? .8 : 1.08, fine * (1. - rib)) * mix(1., .9 + .25 * smoothstep(.0, .12, inside), fine);
        }
      }`);
  };
  material.customProgramCacheKey = () => 'period-city-fallen-leaves-v2';
  return material;
}

let shared: Record<CityMaterialKey, THREE.Material> | undefined;
/** One set of materials for every chunk; `interiorsUrl` gives the lit windows their rooms. */
export function periodCityMaterials(emblemUrl: string, interiorsUrl?: string): Record<CityMaterialKey, THREE.Material> {
  if (shared) return shared;
  const wall = pigmented(new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('beige_wall_001'),
    normalScale: new THREE.Vector2(.8, .8), roughness: .96, metalness: 0 }), [0.339758, 0.262138, 0.188094], 'period-city-wall');
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('japanese_stone_wall'),
    normalScale: new THREE.Vector2(.7, .7), roughness: .95, metalness: 0 });
  stone.name = 'period-city-stone';
  // Dressed stone in staggered courses (石垣) with their joints drawn while they span an art cell (refine round 4: the
  // moat's far wall read as a flat plane in the sunrise light; the cutscenes draw every block of a stone wall).
  stone.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
      {
        vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
        if (1. - abs(dot(normalize(vNormal), up)) > .5) {
          vec2 m = vMapUv * 2.;
          // Big castle-wall blocks (the palace moat's ishigaki run about a metre high), so they read across the moat.
          const float course = .9;
          float row = floor(m.y / course);
          float width = 1.1 + .7 * fract(sin(row * 17.3) * 43758.5453);
          float along = (m.x + fract(sin(row * 7.1) * 43758.5453) * width) / width;
          float dy = abs(fract(m.y / course + .5) - .5) * course, dx = abs(fract(along + .5) - .5) * width;
          // Each direction on its own footprint: a wall seen at a grazing angle along the road keeps its courses
          // (horizontal lines receding to the vanishing point) where its upright joints crowd out.
          float cellX = fwidth(m.x) * 2.5, cellY = fwidth(m.y) * 2.5;
          float lineY = (1. - smoothstep(max(.03, cellY * .5), max(.03, cellY * .5) + cellY * .4, dy)) * (1. - smoothstep(course / 5., course / 3., cellY));
          float lineX = (1. - smoothstep(max(.03, cellX * .5), max(.03, cellX * .5) + cellX * .4, dx)) * (1. - smoothstep(width / 5., width / 3., cellX));
          float shade = (fract(sin(floor(along) * 37.17 + row * 101.31) * 43758.5453) - .5) * (1. - smoothstep(width / 5., width / 3., cellX));
          diffuseColor.rgb *= 1. + shade * .26 * (1. - smoothstep(course / 5., course / 3., cellY)) - max(lineX, lineY) * .45;
        }
      }`);
  };
  stone.customProgramCacheKey = () => 'period-city-stone-v4';
  const roof = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('grey_roof_tiles_02'),
    normalScale: new THREE.Vector2(.8, .8), roughness: .82, metalness: 0 });
  roof.name = 'period-city-roof';
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .5 });
  metal.name = 'period-city-metal';
  const { texture } = signAtlas(emblemUrl);
  signMaterial = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 0, roughness: .55 });
  signMaterial.name = 'period-city-signs';
  sharpPrints(signMaterial, 'period-city-signs-v2');
  // Deep, dark moat water. The pixel pass draws its reflections and lamp
  // columns; the dusk HDR's warm band would otherwise mirror as a pink sheet.
  // Refine round 4: half rough with a fifth of the environment. At roughness
  // .3 and .05 of it the moat and Nara's ponds read as flat pale salmon sheets;
  // fully rough without it, the moats of Aizu and Nijō-jō were black slabs
  // merging with their stone walls, where the repaints paint a dark violet
  // mirror carrying the sky's glow under the lights' streaks.
  const water = new THREE.MeshStandardMaterial({ color: '#0d1220', roughness: .5, metalness: 0, envMapIntensity: .2 });
  water.name = 'period-city-moat-water';
  // Tagged for the pixel pass (refine round 4): alpha .5 in the scene target marks water, which mirrors in full there
  // at any road wetness (surfaces.ts artWaterShare). Opaque, so nothing blends it, and the canvas keeps no alpha.
  water.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a = .5;');
  };
  water.customProgramCacheKey = () => 'period-city-water-v2';
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('forest_ground_04'),
    normalScale: new THREE.Vector2(.7, .7), roughness: 1, metalness: 0 });
  ground.name = 'period-city-grass-and-soil';
  const neon = neonAtlasTexture(emblemUrl).texture;
  neonMaterial = neonSignMaterial(neon);
  sharpPrints(neonMaterial, 'period-city-neon-v3');
  shared = { wall, stone, roof, metal, glass: glassMaterial(interiorsUrl ? interiorsTexture(interiorsUrl) : null), sign: signMaterial, lamp: lampMaterial(), water, ground,
    floodlit: floodlitMaterial(), neon: neonMaterial, flag: bannerMaterial(neon), awning: awningMaterial(awningAtlas()),
    tsuiji: floodlitMaterial(true), leaf: fallenLeafMaterial() };
  return shared;
}
