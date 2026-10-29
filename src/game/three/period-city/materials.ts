import * as THREE from 'three';
import { scannedSurface } from '../surfaces';
import { awningAtlas } from './awnings';
import { neonAtlasTexture, signAtlas, VNEON_BOTTOM_V, VNEON_TOP_V } from './signs';
import type { CityMaterialKey } from './geometry';

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
const wallDirectCut = { value: .45 };
/** The nearest street-lamp heads (world xyz; w 1 where a lamp stands) whose spill washes the facades around them. */
export const cityLampHeads = { value: Array.from({ length: 6 }, () => new THREE.Vector4()) };
/** The facades' lamp wash at full night (linear light at a lamp's foot). */
const lampWash = { value: 1.2 };
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
    shader.uniforms.cityNight = cityNight;
    shader.uniforms.cityWallDirectCut = wallDirectCut;
    shader.uniforms.cityLampHeads = cityLampHeads; shader.uniforms.cityLampWash = lampWash; shader.uniforms.cityGroundLights = cityGroundLights;
    shader.uniforms.cityWallAmbient = wallAmbient; shader.uniforms.cityWallSlate = wallSlate; shader.uniforms.cityWallNightCut = wallNightCut;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float cityPattern; varying float vCityPattern; varying vec3 vCityWorld; varying vec3 vCityWorldNormal;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityPattern = cityPattern;\nvCityWorld = (modelMatrix * vec4(transformed, 1.)).xyz; vCityWorldNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityNight; uniform float cityWallDirectCut; uniform vec4 cityLampHeads[6]; uniform float cityLampWash; uniform float cityGroundLights; uniform vec3 cityWallAmbient; uniform float cityWallSlate; uniform float cityWallNightCut;\nvarying float vCityPattern; varying vec3 vCityWorld; varying vec3 vCityWorldNormal;\nvoid main() {')
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
      // The street lamps light the facades less too: their pools belong to the pavement and road.
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= 1. - clamp(cityNight, 0., 1.) * .8;
        reflectedLight.indirectDiffuse += diffuseColor.rgb * cityWallAmbient * clamp(cityNight, 0., 1.);
        reflectedLight.directDiffuse *= 1. - clamp(cityNight, 0., 1.) * cityWallDirectCut;
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
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1., .7, .42) * wash * cityLampWash * cityGroundLights;
        }`);
  };
  material.customProgramCacheKey = () => `${name}-v13`;
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
    shader.uniforms.cityWindows = windows; shader.uniforms.cityNight = cityNight;
    shader.uniforms.cityInteriors = { value: interiors?.texture ?? null };
    shader.uniforms.cityInteriorsReady = interiors?.ready ?? { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec2 cityWindow; varying vec2 vCityWindow; varying vec2 vCityPane;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityWindow = cityWindow; vCityPane = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec4 cityWindows; uniform float cityNight; uniform sampler2D cityInteriors; uniform float cityInteriorsReady;\nvarying vec2 vCityWindow; varying vec2 vCityPane;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        float seed = vCityWindow.x, kind = vCityWindow.y;
        float hall = step(4.5, kind), lobby = step(3.5, kind) * (1. - hall);
        float share = lobby > .5 ? cityWindows.w * .6 : kind > 1.5 ? cityWindows.w : kind > .5 ? min(1., cityWindows.x * 1.2) : cityWindows.x;
        if ((kind < 2.5 || kind > 3.5) && cityWindows.y > 0. && seed < share) {
          float level = fract(seed * 7.31 + .37), hue = fract(seed * 13.71 + .11);
          vec2 pane = vCityPane;
          // As the concept paints them: a window small on screen is warm light with one clear silhouette in it (a
          // plant on the sill, someone at a desk, a lamp, drawn curtains); only a window large on screen (a shop
          // front, a near window) shows its whole room from the interiors atlas, which shrunk to a few cells turned
          // to noise. The blend follows how many scene pixels the pane spans.
          float spanned = 1. / max(fwidth(pane.x), 1e-4), shopGlass = kind > 1.5 && lobby < .5 ? 1. : 0.;
          float room = cityInteriorsReady > .5 && hall < .5 ? smoothstep(shopGlass > .5 ? 40. : 150., shopGlass > .5 ? 90. : 260., spanned) : 0.;
          // The light: warm amber, brighter under the ceiling; some offices fluorescent; some homes lit by the TV.
          vec3 warm = level < .4 ? vec3(1., .5, .18) : level < .8 ? vec3(1., .56, .24) : vec3(1., .64, .34);
          // Offices sometimes a paler fluorescent, still warm (the concept has no blue-white panes); a few homes the TV's blue, dimmer.
          // Refine round 4: the office tone warmer still, as a cutscene-style repaint keeps every window amber.
          vec3 tone = kind > .5 && kind < 1.5 && hue < .3 ? vec3(1., .66, .38) : kind < .5 && hue < cityWindows.z * .5 ? vec3(.4, .45, .9) * .7 : warm;
          // Held under the tone map's shoulder, so the light stays amber and the silhouettes stay dark against it.
          vec3 glow = tone * mix(.4, .72, smoothstep(.0, .9, pane.y)) * (kind > 1.5 ? .5 : .55);
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
              glow = mix(glow, vec3(1., .62, .46) * .62, mix(.5, .12, clamp(cityNight, 0., 1.)) * (1. - silhouette) * (1. - overlayMask));
          }
          if (room > 0.) {
            // The room: offices, homes, eateries and bars, shops (one each by the window's seed), upright from the
            // street; lobbies a dim office. Bright enough to sit in the highlight range, where the grade keeps it
            // amber; shop fronts, whole walls of glass, a little less so they keep their detail.
            float row = kind > 1.5 && lobby < .5 ? 2. + step(.5, fract(seed * 3.7)) : kind > .5 || lobby > .5 ? 0. : 1.;
            float column = floor(fract(seed * 11.3) * 4.);
            vec2 roomUv = vec2((column + clamp(pane.x, .01, .99)) / 4., 1. - (row + 1. - clamp(pane.y, .01, .99)) / 4.);
            vec3 inside = texture2D(cityInteriors, roomUv).rgb * (kind > 1.5 && lobby < .5 ? 1.5 : 1.9) * (lobby > .5 ? .45 : 1.);
            glow = mix(glow, inside, room);
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
  material.customProgramCacheKey = () => 'period-city-window-glass-v7';
  return material;
}

/** The rooms seen through lit windows (public/assets/sprites/window-interiors.png); `ready` turns 1 once it loads. */
function interiorsTexture(url: string): { texture: THREE.Texture; ready: { value: number } } {
  const ready = { value: 0 };
  const texture = new THREE.TextureLoader().load(url, () => { ready.value = 1; });
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
    shader.uniforms.cityLamps = lamps; shader.uniforms.cityTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vLampAnimation;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampAnimation = uv;');
    // Chasing bulbs (pachinko halls, marquees): each bulb's phase runs on the clock.
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityLamps; uniform float cityTime; varying vec2 vLampAnimation;\nvoid main() {')
      .replace('vec3 totalEmissiveRadiance = emissive;', `vec3 totalEmissiveRadiance = emissive * vColor.rgb * cityLamps
        * (vLampAnimation.y > 1.5 ? .06 + .94 * step(.62, fract(cityTime * .75 - vLampAnimation.x))
          : vLampAnimation.y > .5 ? .18 + .82 * step(.55, fract(cityTime * 1.4 - vLampAnimation.x)) : 1.);`);
  };
  material.customProgramCacheKey = () => 'period-city-lamps-v3';
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
 * stand and fading up the facade (UV v is metres above the base / 3).
 */
function floodlitMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('beige_wall_001'),
    normalScale: new THREE.Vector2(.8, .8), roughness: .94, metalness: 0 });
  material.name = 'period-city-floodlit';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityFlood = flood;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float cityFlood;\nvoid main() {')
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
      // As on the walls: after dark the dusk sky map's warm band stops lighting the stone.
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= 1. - clamp(cityFlood * 2., 0., 1.) * .8;');
  };
  material.customProgramCacheKey = () => 'period-city-floodlit-v4';
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
  const water = new THREE.MeshStandardMaterial({ color: '#0d1220', roughness: .3, metalness: 0, envMapIntensity: .05 });
  water.name = 'period-city-moat-water';
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('forest_ground_04'),
    normalScale: new THREE.Vector2(.7, .7), roughness: 1, metalness: 0 });
  ground.name = 'period-city-grass-and-soil';
  const neon = neonAtlasTexture(emblemUrl).texture;
  neonMaterial = neonSignMaterial(neon);
  sharpPrints(neonMaterial, 'period-city-neon-v3');
  shared = { wall, stone, roof, metal, glass: glassMaterial(interiorsUrl ? interiorsTexture(interiorsUrl) : null), sign: signMaterial, lamp: lampMaterial(), water, ground,
    floodlit: floodlitMaterial(), neon: neonMaterial, flag: bannerMaterial(neon), awning: awningMaterial(awningAtlas()) };
  return shared;
}
