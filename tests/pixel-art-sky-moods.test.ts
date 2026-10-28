import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createPaintedSky } from '../src/poc/painted-sky';
import { oklabFromSrgb, oklch } from '../src/game/three/pixel-art/palette';

type Uniforms = Record<string, THREE.IUniform>;
const uniformsOf = (sky: ReturnType<typeof createPaintedSky>) => (sky.mesh.material as THREE.ShaderMaterial).uniforms as Uniforms;
/** OKLCh of a display-sRGB stop stored as a 0..1 vector. */
const lch = (v: THREE.Vector3) => oklch(oklabFromSrgb(v.x * 255, v.y * 255, v.z * 255));
const sun = new THREE.Vector3(0, .2, 1).normalize();

test('the dusk sky holds a constant high chroma through the indigo -> vermilion rotation', () => {
  const sky = createPaintedSky();
  sky.setRacingSky(.45, sun, 0);
  const u = uniformsOf(sky);
  for (const name of ['skyRaceAway', 'skyRaceToward']) {
    const stops = u[name]!.value as THREE.Vector3[];
    assert.equal(stops.length, 9);
    const hues = stops.map(stop => lch(stop));
    for (const [L, C] of hues) {
      assert.ok(C >= .12 && C <= .19, `${name} chroma ${C.toFixed(3)} at L ${L.toFixed(2)}`);
    }
    // Horizon (stop 0) is warm vermilion, the zenith (stop 8) indigo-violet.
    assert.ok(hues[0]![2] < 40 || hues[0]![2] > 340, `${name} horizon hue ${hues[0]![2]}`);
    assert.ok(hues[8]![2] > 270 && hues[8]![2] < 300, `${name} zenith hue ${hues[8]![2]}`);
    // Lightness falls from the horizon to the zenith.
    assert.ok(hues[0]![0] > hues[8]![0] + .15);
  }
  sky.dispose();
});

test('each night mood has its own keyframe, and the city night is nearly flat indigo', () => {
  const stopsFor = (night: 'city' | 'mountain' | 'harbor') => {
    const sky = createPaintedSky();
    sky.setRacingSky(0, sun, 0, { night, stars: 1 });
    const stops = (uniformsOf(sky).skyRaceAway!.value as THREE.Vector3[]).map(stop => lch(stop));
    sky.dispose();
    return stops;
  };
  const city = stopsFor('city'), mountain = stopsFor('mountain'), harbor = stopsFor('harbor');
  // Tokyo: #151239 .. #1d1a4d, a narrow lightness range.
  assert.ok(Math.max(...city.map(s => s[0])) - Math.min(...city.map(s => s[0])) < .1);
  for (const [L, , h] of city) { assert.ok(L < .32); assert.ok(h > 270 && h < 300); }
  // Hakone is the brighter, saturated violet-indigo; Yokohama the darkest.
  const mean = (stops: number[][], k: number) => stops.reduce((sum, s) => sum + s[k]!, 0) / stops.length;
  assert.ok(mean(mountain, 1) > mean(city, 1) + .03, 'mountain night is more saturated');
  assert.ok(mean(mountain, 0) > mean(city, 0));
  assert.ok(mean(harbor, 0) < mean(mountain, 0));
});

test('stars appear at night, retreat to the upper sky at dusk and vanish at sunrise', () => {
  const sky = createPaintedSky(), stars = uniformsOf(sky).skyRaceStars!.value as THREE.Vector4;
  sky.setRacingSky(0, sun, 0, { night: 'city', stars: 1 });
  const night = stars.clone();
  sky.setRacingSky(.45, sun, 0, { night: 'city', stars: 1 });
  const dusk = stars.clone();
  sky.setRacingSky(1, sun, 1, { night: 'city', stars: 1 });
  assert.ok(night.x > dusk.x && dusk.x > 0);
  assert.ok(dusk.y > night.y, 'dusk stars start higher');
  assert.equal(stars.x, 0);
  sky.setRacingSky(0, sun, 0, { night: 'city', stars: 0 });
  assert.equal(stars.x, 0);
  sky.dispose();
});

test('stars are whole art cells of the target pixel size', () => {
  const sky = createPaintedSky(), stars = uniformsOf(sky).skyRaceStars!.value as THREE.Vector4;
  for (const [input, expected] of [[3, 3], [2.4, 2], [0, 1], [NaN, 1]] as const) {
    sky.setArtCell(input); assert.equal(stars.z, expected);
  }
  sky.dispose();
});

test('the race sky can shade only uncovered pixels; the garage proof keeps its draw-first order', () => {
  const sky = createPaintedSky(), material = sky.mesh.material as THREE.ShaderMaterial;
  assert.equal(material.depthTest, false); assert.equal(sky.mesh.renderOrder, -1000);
  assert.equal(material.depthWrite, false);
  sky.setDepthOccluded(true);
  assert.equal(material.depthTest, true); assert.ok(sky.mesh.renderOrder > 0);
  assert.equal(material.depthFunc, THREE.LessEqualDepth);
  sky.setDepthOccluded(false);
  assert.equal(material.depthTest, false); assert.equal(sky.mesh.renderOrder, -1000);
  sky.dispose();
});

test('re-evaluating the race palette reuses its uniform vectors', () => {
  const sky = createPaintedSky(), u = uniformsOf(sky);
  const away = u.skyRaceAway!.value as THREE.Vector3[], first = [...away];
  for (let d = 0; d <= 1; d += .05) sky.setRacingSky(d, sun, d, { night: 'harbor', stars: .5 });
  assert.equal(u.skyRaceAway!.value, away);
  away.forEach((stop, i) => assert.equal(stop, first[i]));
  sky.dispose();
});
