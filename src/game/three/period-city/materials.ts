import * as THREE from 'three';
import { scannedSurface } from '../surfaces';
import { neonAtlasTexture, signAtlas, VNEON_TOP_V } from './signs';
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
let neonMaterial: THREE.MeshStandardMaterial | undefined;
export function setPeriodCityTime(seconds: number): void { time.value = seconds; }
let signMaterial: THREE.MeshStandardMaterial | undefined;

export function setPeriodCityLighting(upper: number, ground: number, gain: number, cool: number, signs: number, lampGain: number, floodlights = 0): void {
  flood.value = Math.max(0, floodlights);
  windows.value.set(THREE.MathUtils.clamp(upper, 0, 1), Math.max(0, gain), THREE.MathUtils.clamp(cool, 0, 1), THREE.MathUtils.clamp(ground, 0, 1));
  lamps.value = Math.max(0, lampGain);
  if (signMaterial) signMaterial.emissiveIntensity = signs;
  if (neonMaterial) neonMaterial.emissiveIntensity = signs * 1.6 + lampGain * .25;
  bannerGlow.value = signs * .12; cityNight.value = Math.max(0, signs);
}

/** Repaint a scan around the vertex pigment: divide out the scan's mean linear RGB. */
function pigmented(material: THREE.MeshStandardMaterial, mean: readonly [number, number, number], name: string): THREE.MeshStandardMaterial {
  material.name = name;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', /* glsl */ `
        sampledDiffuseColor.rgb /= vec3(${mean.map(v => v.toFixed(6)).join(', ')});
        diffuseColor.rgb *= clamp(mix(vec3(1.0), sampledDiffuseColor.rgb, 0.65), 0.0, 1.6);`));
  };
  material.customProgramCacheKey = () => `${name}-v1`;
  return material;
}

/**
 * Window glass. Each pane carries (seed, kind); a stable share of panes glows
 * (warm homes with a few TV-blue, cool fluorescent offices, bright shops),
 * more at night and few toward sunrise. Office panes brighten toward their
 * ceiling lights; home panes soften at the curtain edges.
 */
function glassMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .16, metalness: .35, envMapIntensity: 1.3 });
  material.name = 'period-city-window-glass';
  material.onBeforeCompile = shader => {
    shader.uniforms.cityWindows = windows;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec2 cityWindow; varying vec2 vCityWindow; varying vec2 vCityPane;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityWindow = cityWindow; vCityPane = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec4 cityWindows; varying vec2 vCityWindow; varying vec2 vCityPane;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        float seed = vCityWindow.x, kind = vCityWindow.y;
        float lobby = step(3.5, kind);
        float share = lobby > .5 ? cityWindows.w * .6 : kind > 1.5 ? cityWindows.w : kind > .5 ? min(1., cityWindows.x * 1.2) : cityWindows.x;
        if ((kind < 2.5 || lobby > .5) && cityWindows.y > 0. && seed < share) {
          float level = fract(seed * 7.31 + .37), hue = fract(seed * 13.71 + .11);
          // Saturated enough to survive the tone map as amber, rose and
          // lavender palette entries rather than one cream white.
          vec3 tint = kind > 1.5 ? vec3(1., .62, .3) * (lobby > .5 ? .9 : 1.)
            : kind > .5 ? (hue < .7 ? vec3(.5, .56, .95) : hue < .9 ? vec3(.9, .74, .5) : vec3(1., .58, .28))
            : hue < cityWindows.z ? (level < .5 ? vec3(.3, .4, 1.) : vec3(.58, .46, 1.))
            : level < .35 ? vec3(1., .66, .32) : level < .8 ? vec3(1., .5, .18) : vec3(1., .4, .22);
          float edge = min(vCityPane.x, 1. - vCityPane.x);
          // Large panes stay dimmer than small windows, so a lit office floor
          // or a shop front reads as warm light, not a blank cream board.
          float shape = kind > .5 && kind < 1.5 ? .6 * mix(.55, 1.15, smoothstep(.55, .95, vCityPane.y))
            : lobby > .5 ? .38 * mix(.6, 1., smoothstep(.0, .8, vCityPane.y))
            : kind > 1.5 ? .55 : mix(.45, .95, smoothstep(.0, .3, edge));
          diffuseColor.rgb *= .3;
          totalEmissiveRadiance += tint * cityWindows.y * mix(.55, 1., level) * shape;
        }
      }`);
  };
  material.customProgramCacheKey = () => 'period-city-window-glass-v1';
  return material;
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
        if (vNeon.y > .5 && vNeon.y < 1.5) lit = step(.3, fract(cityTime * .7 + vNeon.x));
        else if (vNeon.y > 1.5) {
          // Where this texel sits along the sign (0-1), across a horizontal board or down a vertical one.
          float along = vNeon.y > 2.5 ? 1. - vMapUv.y / ${VNEON_TOP_V.toFixed(6)} : fract(vMapUv.x * 4.);
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
        diffuseColor.rgb *= clamp(mix(vec3(1.0), sampledDiffuseColor.rgb, 0.65), 0.0, 1.6);`))
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
        float upright = 1. - abs(dot(normalize(vNormal), up));
        float wash = mix(1.25, .35, smoothstep(0., 30., vMapUv.y * 3.));
        totalEmissiveRadiance += diffuseColor.rgb * cityFlood * upright * wash * vec3(1., .8, .58);
      }`);
  };
  material.customProgramCacheKey = () => 'period-city-floodlit-v1';
  return material;
}

let shared: Record<CityMaterialKey, THREE.Material> | undefined;
/** One set of materials for every chunk. */
export function periodCityMaterials(emblemUrl: string): Record<CityMaterialKey, THREE.Material> {
  if (shared) return shared;
  const wall = pigmented(new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('beige_wall_001'),
    normalScale: new THREE.Vector2(.8, .8), roughness: .96, metalness: 0 }), [0.339758, 0.262138, 0.188094], 'period-city-wall');
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('japanese_stone_wall'),
    normalScale: new THREE.Vector2(.7, .7), roughness: .95, metalness: 0 });
  stone.name = 'period-city-stone';
  const roof = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('grey_roof_tiles_02'),
    normalScale: new THREE.Vector2(.8, .8), roughness: .82, metalness: 0 });
  roof.name = 'period-city-roof';
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .5 });
  metal.name = 'period-city-metal';
  const { texture } = signAtlas(emblemUrl);
  signMaterial = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 0, roughness: .55 });
  signMaterial.name = 'period-city-signs';
  // Deep, dark moat water. The pixel pass draws its reflections and lamp
  // columns; the dusk HDR's warm band would otherwise mirror as a pink sheet.
  const water = new THREE.MeshStandardMaterial({ color: '#0d1220', roughness: .3, metalness: 0, envMapIntensity: .05 });
  water.name = 'period-city-moat-water';
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('forest_ground_04'),
    normalScale: new THREE.Vector2(.7, .7), roughness: 1, metalness: 0 });
  ground.name = 'period-city-grass-and-soil';
  const neon = neonAtlasTexture(emblemUrl).texture;
  neonMaterial = neonSignMaterial(neon);
  shared = { wall, stone, roof, metal, glass: glassMaterial(), sign: signMaterial, lamp: lampMaterial(), water, ground,
    floodlit: floodlitMaterial(), neon: neonMaterial, flag: bannerMaterial(neon) };
  return shared;
}
