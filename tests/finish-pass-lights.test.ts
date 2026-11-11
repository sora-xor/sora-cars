import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { createPaintedSky } from '../src/poc/painted-sky';
import { FarLand } from '../src/game/three/period-city/far-land';
import { streetScene } from '../src/game/three/period-city/street-scenes';

const source = (file: string) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('the clouds paint whole clusters warm in the low sun over a clearer sky, and switch back for A/B', () => {
  const sky = createPaintedSky(), material = sky.mesh.material as THREE.ShaderMaterial;
  // On by default: per-cluster tone, warm bodies, dark shade, thinner strata in the low sun.
  assert.deepEqual(sky.raceStyle.value.toArray(), [1, 1, 1, 1]);
  assert.equal(material.uniforms.skyRaceStyle, sky.raceStyle);
  const glsl = material.fragmentShader;
  // The strata thin in the low sun, the dark violet banks most; the popcorn picks lit or shaded by its cluster.
  assert.ok(glsl.includes('float lowSunThin = skyRaceStyle.w * max(max(skyRaceAfternoon, skyRaceCloud.z), skyRaceDawn);'));
  assert.ok(glsl.includes('- lowSunThin * .3, -1.0000)') && glsl.includes('- lowSunThin * .12, 1.0000)'));
  assert.ok(glsl.includes('cluster = lattice(vec2(wrapped.x / 16., id.y / 5.) + vec2(0., 17.7), 32.);'));
  // Only the low sun warms the bodies: night, plain dusk and a late-day route's afterglow (November 12) keep the gradient's.
  assert.ok(glsl.includes('float low = max(max(skyRaceAfternoon, skyRaceCloud.z), skyRaceDawn) * skyRaceStyle.y;'));
  sky.dispose();
});

test('stone lanterns glow in the golden hours while the street lamps stay off', async () => {
  const [ground, materials, geometry] = await Promise.all([source('game/three/period-city/open-ground.ts'),
    source('game/three/period-city/materials.ts'), source('game/three/period-city/geometry.ts')]);
  // The firebox alone takes lamp mode 3; everything after it is a plain lamp again.
  assert.ok(ground.includes("b.animation = [0, 3]; b.colour.set('#ffbe73'); prism(b, 'lamp', 6, .22 * s, 1.36 * s, .22 * s, 1.72 * s, Math.PI / 6); b.animation = [0, 0];"));
  assert.ok(geometry.includes('3 lit by day too'));
  // Mode 3 takes the brighter of the night's lamps and the golden hours' lanterns, steady (no chase or blink).
  assert.ok(materials.includes('(vLampAnimation.y > 2.5 ? max(cityLamps, cityLanterns) : cityLamps)'));
  assert.ok(materials.includes('* (vLampAnimation.y > 2.5 ? 1. : vLampAnimation.y > 1.5 ?'));
  assert.ok(materials.includes("'period-city-lamps-v4'") && materials.includes('lanterns.value = lanternGolden.value * THREE.MathUtils.clamp(golden, 0, 1);'));
});

test('the wet road mirrors twenty lamps ahead of the camera, the lit shops the rest', async () => {
  const world = await source('game/three/world.ts');
  assert.ok(world.includes('const LAMP_BEHIND = 12, LAMP_COLUMNS = 20;'));
  assert.ok(world.includes('const lampSlots = Math.min(this.lampSlotLimit, LAMP_COLUMNS, this.groundEmitters.length - (this.periodCity.active ? SHOP_COLUMNS : 0));'));
  assert.ok(world.includes('.dot(this.cameraAhead) < -LAMP_BEHIND) continue;'));
});

test('far ridges by day: violet masses darker than their haze, on wooded hills seen near the horizon only', () => {
  const luminance = (hex: string) => { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
  const landOf = (id: string) => streetScene(id)!.distant.find(item => item.land)!.land!;
  const ridge = (land: FarLand) => ((land.group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial);
  for (const id of ['nara-1986', 'irohazaka-1986']) {
    const plan = landOf(id), haze = plan.haze!;
    assert.ok(plan.ridges, `${id} paints its far ridges`);
    // The haze rendered lighter than the sky; the ridges must stay darker than it, toward the sun and away.
    assert.ok(luminance(plan.ridges.away) < luminance(haze.away) && luminance(plan.ridges.toward) < luminance(haze.toward), id);
    const land = new FarLand(plan), material = ridge(land);
    land.update(.95);
    assert.ok(material.uniforms.farRidge.value.y > .99, `${id}: ridges by day`);
    assert.equal(material.uniforms.farRidgeAway.value.getHexString(), new THREE.Color(plan.ridges.away).getHexString());
    land.update(0);
    assert.equal(material.uniforms.farRidge.value.y, 0, `${id}: the night keeps its own land`);
    // Hills only (fields and towns keep their colour), from about half the plan's metres, and never on slopes looked
    // down on from above (Wakakusa-yama's summit read them as a blue-violet lake).
    assert.ok(material.vertexShader.includes('smoothstep(farRidge.x * .6, farRidge.x * 2.2, farTrue) * smoothstep(.1, .6, landWood)'));
    assert.ok(material.vertexShader.includes('(1. - smoothstep(.03, .09, below))'));
    land.dispose();
  }
  // A plan without ridges keeps the stage off by day as well (Aizu's evening land).
  const aizu = new FarLand(landOf('aizu-wakamatsu-1986'));
  aizu.update(.9);
  assert.equal(ridge(aizu).uniforms.farRidge.value.y, 0);
  aizu.dispose();
});

test('a temple wall takes leaf shade in the golden hours, calm at speed, and its own material', async () => {
  const [ground, materials, geometry] = await Promise.all([source('game/three/period-city/open-ground.ts'),
    source('game/three/period-city/materials.ts'), source('game/three/period-city/geometry.ts')]);
  // Only the temple's earthen wall and its white lines take the new key; the 77 floodlit landmark parts keep theirs.
  assert.ok(geometry.includes("| 'tsuiji';") && geometry.includes('floodlit: 3, tsuiji: 3'));
  assert.ok(ground.includes("strip(b, 'tsuiji', s0, s1, () => wall, .45, () => wall, 3.4, toRoad);"));
  assert.equal((ground.match(/'tsuiji'/g) ?? []).length, 2);
  assert.ok(materials.includes('tsuiji: floodlitMaterial(true)') && materials.includes("leafy ? 'period-city-tsuiji-v2' : 'period-city-floodlit-v5'"));
  // November 12: the wall keeps its full sun in the golden hours (none of the walls' cut) and the shade covers less of it,
  // so it reads as sunlit golden plaster dappled with shade, as the repaint paints it (wall band L .46 to .58; repaint .58).
  assert.ok(materials.includes('export const tsuijiGoldenCut = { value: 0 };') && materials.includes('export const leafShadeCover = { value: .14 };'));
  assert.ok(materials.includes("reflectedLight.directDiffuse *= 1. - goldenCut${leafy ? ' * cityTsuijiCut' : ''};"));
  assert.ok(materials.includes('smoothstep(.33 + cityLeafCover, .52 + cityLeafCover, crown)'));
  // Golden hours only, at .9 of the low key, and the leaves fade with the camera's travel per tick (they strobed at speed),
  // leaving the crowns' clusters in full shade.
  assert.ok(materials.includes('export const leafShadeGolden = { value: .9 };'));
  assert.ok(materials.includes('leafShade.value = leafShadeGolden.value * THREE.MathUtils.clamp(golden, 0, 1);'));
  assert.ok(materials.includes('(1. - smoothstep(.3, .6, travel / .5))') && materials.includes('(1. - smoothstep(.3, .6, travel / .22))'));
  assert.ok(materials.includes('float dappled = mix(.95, smoothstep(.42, .54, leaves), max(leaf, vein));'));
});

test('the sky paints Aizu’s ranges navy-violet and Nara’s hills mauve, where its low gradient made them maroon and tan', () => {
  const luminance = (hex: string) => { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
  const aizu = streetScene('aizu-wakamatsu-1986')!.mood, nara = streetScene('nara-1986')!.mood;
  assert.equal(aizu.ridges, '#3a2c5e');
  assert.equal(nara.ridges, '#5e4470');
  // Dark masses against the afterglow and the golden sky: the repaints' mountain bodies (#36265b, #714879).
  assert.ok(luminance(aizu.ridges!) < .04 && luminance(nara.ridges!) < .09);
});

test('the golden hours glow low over the horizon, under the far ridges, and switch off for A/B', () => {
  const sky = createPaintedSky(), material = sky.mesh.material as THREE.ShaderMaterial, glsl = material.fragmentShader;
  assert.equal(sky.raceGlow.value, 1);
  assert.equal(material.uniforms.skyRaceGlow, sky.raceGlow);
  // Full to about 3 degrees and gone by 11 (from the true horizon it was hidden by the land), late-day routes only (Tokyo's sunrise keeps
  // its own halo), gold toward the sun in the afternoon and red-orange in the afterglow.
  assert.ok(glsl.includes('float glowShare = (1. - smoothstep(.05, .2, elevation)) * skyRaceGolden * skyRaceGlow * mix(.55, .9, sunward);'));
  // Drawn before the far ridges and the far city, which stand in front of it; the golden hours' darkening spares it.
  assert.ok(glsl.indexOf('float glowShare') < glsl.indexOf('sky = raceCitySkyline(sky, angular.x, elevation, cellAngle);'));
  assert.ok(glsl.includes('* (1. - glowShare);'));
  sky.dispose();
});

test('no statement of the race sky shader hides behind a line comment', () => {
  // Twice in this pass an edit joined a declaration onto the end of a comment line (`// ... off      const float PI`):
  // the sky failed to compile and every race drew a flat dark sky, with no string check noticing.
  const sky = createPaintedSky(), glsl = (sky.mesh.material as THREE.ShaderMaterial).fragmentShader;
  for (const line of glsl.split('\n')) {
    const comment = line.indexOf('//');
    if (comment < 0) continue;
    assert.ok(!/\s{3,}(const|uniform|float|vec[234]|if|return)\b/.test(line.slice(comment)), `a statement after a comment: ${line.trim()}`);
  }
  sky.dispose();
});
