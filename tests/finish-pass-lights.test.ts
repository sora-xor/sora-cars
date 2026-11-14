import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { createPaintedSky } from '../src/poc/painted-sky';
import { FarLand } from '../src/game/three/period-city/far-land';
import { streetScene } from '../src/game/three/period-city/street-scenes';
import { CityMeshBuilder, HALL_BAY, HALL_PLAIN, hallGlazing, ROUND_LAMP, WALL_PATTERN, WINDOW_KIND } from '../src/game/three/period-city/geometry';
import { MAPLE_LEAF_GLSL } from '../src/game/three/maple-leaf-glsl';
import { floraLeafGrowth, leafGrowthGlsl, roadsideLeafGrowth } from '../src/game/three/autumn-foliage';
import { FLORA_KIND, floraMeshes } from '../src/game/three/period-city/flora';
import { terrainAutumnFinish, terrainAutumnGolden, terrainGroundGlare } from '../src/game/three/terrain';

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
  assert.ok(materials.includes("'period-city-lamps-v5'") && materials.includes('lanterns.value = lanternGolden.value * THREE.MathUtils.clamp(golden, 0, 1);'));
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
  assert.ok(geometry.includes("| 'tsuiji' | 'leaf';") && geometry.includes('floodlit: 3, tsuiji: 3'));
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

test('golden-hour asphalt takes the grade’s cool shade instead of the old warm-road guard', async () => {
  // November 12: the guard only acted in a late-day route's golden hours, where it held the road orange-brown under the
  // true-light repaints' slate and mauve; Tokyo's sunrise and Nikko measure the same with or without it.
  const pass = await source('game/three/pixel-art/pass.ts');
  assert.ok(pass.includes('  dayRoadColourKeep: 0,\n'));
});

test('a hall’s glazing carries its bays and height to the glass shader, which draws its frame, lights and people', async () => {
  // Packed under a half, so every test of the window's kind still reads a hall; unpacked as the shader does.
  const unpack = (kind: number) => { const size = Math.floor((kind - 5) * 4096 + .5); return { bays: size % 64, tall: Math.floor(size / 64) * .5 }; };
  for (const [width, height] of [[4.6, 3.2], [.4, .3], [60, 20], [20, 2.8], [2, 2.9]] as const) {
    const packed = hallGlazing(width, height), { bays, tall } = unpack(Math.fround(WINDOW_KIND.hall + packed));
    assert.ok(packed > 0 && packed < .5, `${width} x ${height} m packs to ${packed}`);
    assert.equal(bays, Math.min(40, Math.max(1, Math.round(width / HALL_BAY))));
    assert.equal(tall, Math.min(30, Math.max(1, Math.round(height * 2))) / 2);
  }
  // The builder sizes a hall's rectangle by itself; other kinds, and a hall's triangle (a glazed gable), stay as they were.
  const b = new CityMeshBuilder(0, 0);
  b.window = [.3, WINDOW_KIND.hall]; b.front('glass', -2.3, 2.3, .5, 3.7, 0);
  b.face('glass', [[-5, 4.9, 0], [5, 4.9, 0], [0, 9.4, 0]], [0, 0, -1]);
  b.window = [.3, WINDOW_KIND.shop]; b.front('glass', -2.3, 2.3, .5, 3.7, 0);
  const kinds = b.finish().get('glass')!.getAttribute('cityWindow');
  for (let i = 0; i < 6; i++) assert.deepEqual(unpack(kinds.getY(i)), { bays: 4, tall: 3 });
  for (let i = 6; i < 9; i++) assert.equal(kinds.getY(i), WINDOW_KIND.hall);
  for (let i = 9; i < 15; i++) assert.equal(kinds.getY(i), WINDOW_KIND.shop);
  // A hall whose builder models its own frame (the petrol stand's kiosk) is still a hall to the shader, with no size.
  const plain = new CityMeshBuilder(0, 0);
  plain.window = [0, HALL_PLAIN]; plain.front('glass', -4, 4, .2, 2.6, 0);
  const plainKind = plain.finish().get('glass')!.getAttribute('cityWindow').getY(0);
  assert.ok(plainKind > 4.5 && unpack(plainKind).bays === 0 && unpack(plainKind).tall === 0);
  const materials = await source('game/three/period-city/materials.ts');
  assert.ok(materials.includes('float hallSize = floor((kind - 5.) * 4096. + .5), hallBays = mod(hallSize, 64.), hallTall = floor(hallSize / 64.) * .5;'));
  // Only a sized hall, fading to the flat light where a bay spans under a few scene pixels, and off for A/B.
  assert.ok(materials.includes('if (hall > .5 && hallBays > 0. && cityHallGlazing > 0.) {'));
  assert.ok(materials.includes('float detail = smoothstep(4., 10., 1. / max(fwidth(bx), 1e-4)) * cityHallGlazing;') && materials.includes('glow = mix(glow, inside, detail);'));
  assert.ok(materials.includes('export const hallGlazingDetail = { value: 1 };') && materials.includes("'period-city-window-glass-v17'"));
});

test('round lamps deepen toward their limb, and a canopy’s underside is a warm ceiling under tube lights', async () => {
  const b = new CityMeshBuilder(0, 0);
  b.colour.setRGB(2, 1.3, .55); b.cylinder('lamp', 0, 3.55, 0, .2, .38, 10, false);
  b.animation = [.5, 1]; b.cylinder('lamp', 2, 3.55, 0, .2, .38, 10, false);
  assert.deepEqual(b.animation, [.5, 1], 'the builder keeps its own animation');
  b.animation = [0, 0]; b.box('lamp', 4, 4.4, 4.6, 4.75, -.07, .07);
  let lamps = b.finish().get('lamp')!.getAttribute('uv');
  // A steady cylinder is round; a chasing bulb keeps its phase; a lamp box stays plain.
  for (let i = 0; i < 60; i++) assert.deepEqual([lamps.getX(i), lamps.getY(i)], [ROUND_LAMP, 0]);
  for (let i = 60; i < 120; i++) assert.deepEqual([lamps.getX(i), lamps.getY(i)], [.5, 1]);
  for (let i = 120; i < lamps.count; i++) assert.deepEqual([lamps.getX(i), lamps.getY(i)], [0, 0]);
  // The canopy: one ceiling quad, then a tube every 2.4 m (two rows under a deep canopy), all facing down.
  for (const [x0, x1, z0, z1, tubes] of [[-23.4, 23.4, -1.2, 1.8, 20], [-8.4, 8.4, 1.2, 5.8, 14], [-.5, .5, -4, 4, 3]] as const) {
    const c = new CityMeshBuilder(0, 0);
    c.colour.set('#ffe2b6'); const light = c.colour.clone();
    c.soffit(x0, x1, z0, z1, 3.89);
    assert.ok(c.colour.equals(light), 'the builder keeps its colour');
    const mesh = c.finish().get('lamp')!, colour = mesh.getAttribute('color'), at = mesh.getAttribute('position'), normal = mesh.getAttribute('normal');
    assert.equal(at.count, 6 * (1 + tubes));
    const luminance = (i: number) => .2126 * colour.getX(i) + .7152 * colour.getY(i) + .0722 * colour.getZ(i), lit = .2126 * light.r + .7152 * light.g + .0722 * light.b;
    assert.ok(luminance(0) < lit * .4 && luminance(6) > lit * 1.4, 'a ceiling well under its lamps’ light, the tubes over it');
    for (let i = 0; i < at.count; i++) {
      assert.equal(normal.getY(i), -1);
      assert.ok(at.getX(i) >= x0 - 1e-6 && at.getX(i) <= x1 + 1e-6 && at.getZ(i) >= z0 - 1e-6 && at.getZ(i) <= z1 + 1e-6, 'within the canopy');
    }
  }
  const [materials, street, landmarks, buildings] = await Promise.all(['materials', 'street', 'landmarks', 'buildings'].map(name => source(`game/three/period-city/${name}.ts`)));
  assert.ok(materials.includes('if (vLampAnimation.x > 1.5 && vLampAnimation.y < .5) {') && materials.includes('export const lampLimb = { value: .85 };'));
  // The shopping streets' globes wear a dark cap and collar; no canopy keeps the flat cream sheet.
  assert.ok(street.includes("b.cylinder('metal', x + dx, 3.93, z, .235, .07, 10); b.cylinder('metal', x + dx, 3.49, z, .12, .06, 10, false);"));
  assert.ok(!/flat\('lamp', [^;]*, -1\)/.test(landmarks + buildings) && (landmarks + buildings).split('b.soffit(').length === 12);
});

test('fallen leaves are cut into maple leaves near the camera and stay diamonds far off, without shadows', async () => {
  const [materials, index, street] = await Promise.all(['materials', 'index', 'street'].map(name => source(`game/three/period-city/${name}.ts`)));
  assert.ok(materials.includes('leaf: fallenLeafMaterial()') && materials.includes('export const fallenLeafShape = { value: 1 };'));
  // Lobes thinner than an art cell fill out to the diamond, which alone remains far off and at cityLeafShape 0.
  assert.ok(materials.includes('float inside = cityLeafShape > .5 ? max(maple - 1.5 * smoothstep(.16, .26, span), diamond - (1. - fill) * 1.2) : diamond;'));
  assert.ok(materials.includes('if (inside < 0.) discard;'));
  assert.ok(index.includes("new Set(['glass', 'lamp', 'sign', 'water', 'neon', 'flag', 'leaf'])"));
  // The square holds the old diamond at its old length (the diamond's half-length .8 of the square's, 1 / 1.25).
  assert.ok(street.includes('const LEAF_SQUARE = 1.25;') && materials.includes('float diamond = 1. - abs(vLeaf.y) / .8 - abs(vLeaf.x) / .52;'));
  // The outline itself, as the shader cuts it: seven lobes round a hub, a notch where the stalk joins.
  const lobe = (px: number, py: number, dx: number, dy: number, l: number, w: number) => {
    const along = px * dx + py * dy, across = Math.abs(px * dy - py * dx);
    return w * Math.min(along / (.34 * l), (l - along) / (.66 * l)) - across;
  };
  const numbers = (text: string) => [...text.matchAll(/leafLobe\(p, vec2\(([-.\d]+), ([-.\d]+)\), ([.\d]+), ([.\d]+)\)/g)].map(m => m.slice(1).map(Number));
  // The outline lives in one module, shared with the banks' leaf carpet (round ten).
  const lobes = numbers(MAPLE_LEAF_GLSL);
  assert.ok(materials.includes('${MAPLE_LEAF_GLSL}void main() {') && materials.includes('vec2 leaf = mapleLeaf(vLeaf);'));
  assert.equal(lobes.length, 4, 'the middle lobe and three mirrored pairs');
  const inside = (x: number, y: number) => { const px = Math.abs(x), py = y + .22; return Math.max(.2 - Math.hypot(px, py), ...lobes.map(([dx, dy, l, w]) => lobe(px, py, dx!, dy!, l!, w!))) >= 0; };
  let tips = 0, covered = 0, total = 0;
  for (let k = 0; k < 720; k++) {
    // Count the lobes' tips round the leaf: runs of the outline reaching past 0.6 of the square.
    const a = k / 720 * Math.PI * 2, far = inside(Math.sin(a) * .62, Math.cos(a) * .62 - .22), before = inside(Math.sin(a - Math.PI / 360) * .62, Math.cos(a - Math.PI / 360) * .62 - .22);
    if (far && !before) tips++;
  }
  for (let x = -.995; x < 1; x += .01) for (let y = -.995; y < 1; y += .01) { total++; if (inside(x, y)) covered++; }
  assert.equal(tips, 5, 'five long lobes (the two lowest are short)');
  assert.ok(inside(0, .9) && inside(.7, .4) && inside(-.7, .4) && !inside(.45, .75) && !inside(0, -.6), 'pointed lobes with gaps between, a notch at the stalk');
  assert.ok(covered / total > .2 && covered / total < .34, `the leaf covers ${(covered / total * 100).toFixed(0)}% of its square, about the diamond’s 21%`);
});

test('the autumn banks carry a carpet of maple leaves at three sizes, patched lawns, and no mirror of the sun', async () => {
  const terrain = await source('game/three/terrain.ts');
  // On by default, with switches for A/B; gold leaves only as far as the golden hours have come.
  assert.deepEqual(terrainAutumnFinish.value.toArray(), [1, 1]);
  assert.equal(terrainGroundGlare.value, 0);
  assert.equal(terrainAutumnGolden.value, 0);
  assert.ok(terrain.includes('tone < .26 * soraAutumnGolden ? vec3(.694, .356, .033)'));
  // Three sizes, each twice the last, cross-faded by the ground a scene pixel covers; past the largest, the mean colour.
  assert.ok(terrain.includes('float footprint = sqrt(abs(dFdx(q.x) * dFdy(q.y) - dFdx(q.y) * dFdy(q.x)));'));
  assert.ok(terrain.includes('level = min(floor(octave), 2.)') && terrain.includes('float size = .42 * exp2(level);'));
  assert.ok(terrain.includes('share * .1 * (1. - clamp(here + below, 0., 1.))'));
  // The weights the shader uses: at every footprint the sizes in play sum to at most two layers, never a gap near the car.
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let footprint = .002; footprint < .4; footprint *= 1.07) {
    const octave = Math.max(0, Math.log2(footprint / .01134)), level = Math.min(Math.floor(octave), 2), t = octave - level;
    const here = (level < .5 ? 1 : smooth(0, .55, t)) * (1 - smooth(1, 1.5, t)), below = level < .5 ? 0 : 1 - smooth(0, .5, t);
    // A leaf of the size in play spans at least six scene pixels while it is drawn at more than a tenth.
    const size = .42 * 2 ** level, across = (cells: number) => 2 * .45 * cells / footprint;
    if (here > .1) assert.ok(across(size) > 6, `size ${size} at ${footprint.toFixed(3)} m a pixel spans ${across(size).toFixed(1)} px`);
    if (below > .1) assert.ok(across(size / 2) > 6, `size ${size / 2} at ${footprint.toFixed(3)} m a pixel spans ${across(size / 2).toFixed(1)} px`);
    // The largest size fades out from 9 to 13 cm of ground a pixel.
    if (footprint < .09) assert.ok(here + below > .45, `leaves at ${footprint.toFixed(3)} m a pixel`);
    if (footprint > .129) assert.ok(here + below < .01, 'far off, only their mean colour');
  }
  // Both ground programs drop the mirror reflection (grass, moss and soil mirror nothing); only the autumn one draws the carpet.
  assert.ok(terrain.includes("'#include <lights_fragment_end>\\nreflectedLight.directSpecular *= soraGroundGlare; reflectedLight.indirectSpecular *= soraGroundGlare;'"));
  assert.ok(terrain.includes("autumn > 0 ? 'sora-forest-ground-blend-v3-autumn' : 'sora-forest-ground-blend-v2'"));
  assert.ok(terrain.includes('shader.uniforms.soraAutumnFinish = terrainAutumnFinish; shader.uniforms.soraGroundGlare = terrainGroundGlare;'));
  const litter = terrain.slice(terrain.indexOf('const AUTUMN_LITTER'), terrain.indexOf('const AUTUMN_HEADER'));
  assert.ok(litter.includes('soraCarpetLeaf(q, size, float(layer) + level * 3., footprint, share)') && terrain.includes('${autumn > 0 ? AUTUMN_LITTER : \'\'}'));
  // The lawn's broad patches hold at any distance: several metres across, never faded by the footprint.
  assert.ok(litter.includes('float sweep = soraNoise(q / 9.3 + 3.) * .6 + soraNoise(q / 2.9 - 7.) * .4;'));
});

test('painted iron sheet rusts and laps, copper-fronted shops wear it on their flanks, and low flanks carry tin signs', async () => {
  const [materials, buildings] = await Promise.all(['materials', 'buildings'].map(name => source(`game/three/period-city/${name}.ts`)));
  // The shader rounds the sheet to the seams' ribs and reads its fraction as the mark for rust and laps.
  assert.equal(Math.floor(WALL_PATTERN.sheet + .5), WALL_PATTERN.seams);
  assert.ok(WALL_PATTERN.sheet - WALL_PATTERN.seams > .12);
  assert.ok(materials.includes('if (vCityPattern - pattern > .12 && citySheetRust > 0.) {') && materials.includes('export const sheetRust = { value: 1 };'));
  // A bamboo inuyarai keeps the plain seams; sheds and sheet shophouses take the sheet; a copper front keeps its seams.
  assert.ok(buildings.includes('b.pattern = WALL_PATTERN.seams; b.colour.copy(tint);'));
  assert.ok(buildings.includes('if (front0 === WALL_PATTERN.seams) b.pattern = WALL_PATTERN.sheet;\n  shell(x, f, w, d, h, false, false);\n  b.pattern = front0;'));
  // Tin signs come from the lot's own seed (no draw from the building's streams) on frontage buildings only.
  assert.ok(buildings.includes('if (detail === 2) tinSigns(x, w, d, h);'));
  assert.ok(buildings.includes('const pick = seeded(hashInts(lot.seed, 1986, 733)), face = toward * (w / 2 + .035);'));
  const body = buildings.slice(buildings.indexOf('function tinSigns('), buildings.indexOf('function flankGrid('));
  assert.ok(!/\brandom\(\)|\bextra\(\)/.test(body), 'tin signs leave the building\u2019s own streams alone');
});

test('the town lamps burn in the golden hours at part strength, and sunlit walls take more of the cut', async () => {
  const [world, materials] = await Promise.all([source('game/three/world.ts'), source('game/three/period-city/materials.ts')]);
  // Round twelve: lanterns and globes lit at .45 of the night's in a late-day route's golden hours (they hung dark brown
  // down Sanjō-dōri, where the repaints light them); the road's light pools keep following the lamps alone.
  assert.ok(world.includes('const GOLDEN_LAMPS = 0.45;') && world.includes('goldenLamps = GOLDEN_LAMPS;'));
  assert.ok(world.includes('THREE.MathUtils.lerp(1, PERIOD_SUNRISE_LAMPS, morning) * Math.max(lampsOn, this.goldenLamps * golden)'));
  assert.ok(world.includes('const poolIntensity = mood.lampIntensity * THREE.MathUtils.lerp(1, SUNRISE_POOL_GAIN, sunrise) * lampsOn;'));
  // The walls' golden-hours cut at .65 (was .5), switchable for A/B.
  assert.ok(materials.includes('export const WALL_GOLDEN_CUT = { value: .65 };'));
  assert.ok(materials.includes('wallGoldenCut.value = WALL_GOLDEN_CUT.value * THREE.MathUtils.clamp(golden, 0, 1);'));
});

test('maple leaves grow about their stalks with distance, in both crown systems, and only maples', async () => {
  // Round thirteen: none nearer than 14 m, then in step with distance up to 2.6 times (roadside) or 1.8 (flora cards).
  assert.deepEqual(roadsideLeafGrowth.value.toArray(), [14, 2.6, 1]);
  assert.deepEqual(floraLeafGrowth.value.toArray(), [14, 1.8, 1]);
  const glsl = leafGrowthGlsl('soraLeafGrowth');
  // Gated by the switch and by the attribute's w (a geometry without it reads w 1 and never grows), the distance taken
  // in the world from the leaf's own centre, through the batch and instance matrices.
  assert.ok(glsl.includes('if (soraLeafGrowth.z > 0. && leafCentre.w < .5) {'));
  assert.ok(glsl.includes('soraLeafAt = batchingMatrix * soraLeafAt;') && glsl.includes('soraLeafAt = instanceMatrix * soraLeafAt;'));
  assert.ok(glsl.includes('clamp(length(soraLeafAt.xyz - cameraPosition) / soraLeafGrowth.x, 1., soraLeafGrowth.y)'));
  assert.ok(glsl.includes('transformed = leafCentre.xyz + (transformed - leafCentre.xyz) * soraGrow;'));
  // The flora maples' leaf cards carry their centres (w 0); every other plant's vertices carry their own place (w 1).
  for (const kind of [FLORA_KIND.maple, FLORA_KIND.cedar, FLORA_KIND.grass, FLORA_KIND.bush]) {
    const meshes = floraMeshes([kind, 0, 0, 0, 0, 1, .5, .2, .1, 0]), leaves = meshes.find(m => m.name.includes('leaves'))!;
    const at = leaves.geometry.getAttribute('position'), centre = leaves.geometry.getAttribute('leafCentre');
    assert.ok(centre && centre.itemSize === 4, `kind ${kind} carries leafCentre`);
    const used = leaves.geometry.index ? new Set(Array.from(leaves.geometry.index.array)) : new Set(Array.from({ length: at.count }, (_, i) => i));
    const ws = [...used].map(i => centre.getW(i));
    assert.ok(ws.every(w => w === (kind === FLORA_KIND.maple ? 0 : 1)), `kind ${kind}: w ${kind === FLORA_KIND.maple ? 0 : 1} on every vertex`);
    if (kind === FLORA_KIND.maple) for (let i = 0; i + 3 < 400; i += 4) {
      // A card's four corners share its centre, their mean.
      const mean = [0, 1, 2].map(axis => [0, 1, 2, 3].reduce((sum, k) => sum + at.getComponent(i + k, axis), 0) / 4);
      for (let k = 0; k < 4; k++) for (const axis of [0, 1, 2]) assert.ok(Math.abs(centre.getComponent(i + k, axis) - mean[axis]!) < 1e-4);
    }
    for (const mesh of meshes) mesh.dispose();
  }
  // The roadside crowns: each leaf's stalk, w 0 for a maple's leaves and 1 for the cherries' petals; their material grows them.
  const [scenery, world, flora] = await Promise.all([source('game/three/scenery.ts'), source('game/three/world.ts'), source('game/three/period-city/flora.ts')]);
  assert.ok(scenery.includes("geometry.setAttribute('leafCentre', new THREE.Float32BufferAttribute(Array.from({ length: leafVertices },")
    && scenery.includes('() => [position.x, position.y, position.z, maple ? 0 : 1]).flat(), 4));'));
  assert.ok(world.includes("shader.uniforms.soraLeafGrowth = roadsideLeafGrowth;") && world.includes("`#include <begin_vertex>${leafGrowthGlsl('soraLeafGrowth')}`"));
  assert.ok(flora.includes("shader.uniforms.soraLeafGrowth = floraLeafGrowth;") && flora.includes("'period-flora-leaves-v5'"));
  // Shadows keep the leaves' true size: the depth materials never take the growth.
  assert.ok(!flora.slice(flora.indexOf('const depth = withCanopyGaps('), flora.indexOf('return materials = {')).includes('leafGrowth'));
});

test('far lamp heads open small windows through the roadside crowns, placed as the race camera renders', async () => {
  const world = await source('game/three/world.ts');
  // Round fourteen: the race lamps' heads hang inside the maples' crown band, so down an avenue every head beyond about
  // 20 m was hidden. Each far head opens a window about its glow wide through the leaves from 30% of its distance in.
  assert.ok(world.includes('const LAMP_WINDOW_METRES = .3, LAMP_WINDOW_CELLS = 1.5, LAMP_WINDOW_NEAR = 18, LAMP_WINDOW_FULL = 26, LAMP_WINDOW_GLOW = 2;'));
  assert.ok(world.includes('if (soraReach < 1.) discard;') && world.includes('if (vSoraClip.w > soraWindow.z - .5 || vSoraClip.w < soraWindow.z * .3) continue;'));
  // Only for the race camera (the reflection probes render the same scene) and placed at render time, where the camera
  // stands this frame: placed earlier they trailed the lamps at speed and opened dark rings beside them.
  assert.ok(world.includes('this.scene.onBeforeRender = (_renderer, _scene, camera) => { lampWindowCount.value = camera === this.camera ? this.placeLampWindows() : 0; };'));
  // Only lit lamps, nearest first; a lamp closing in shuts its window gradually.
  assert.ok(world.includes('if (this.lampWindowsOn && this.lampIntensityNow > 0) {'));
  assert.ok(world.includes('* THREE.MathUtils.smoothstep(depth, LAMP_WINDOW_NEAR, LAMP_WINDOW_FULL));'));
  assert.ok(world.includes(':sora-maple-light-v7'));
});

test('a warm lamp halo over warm, saturated ground keeps its chroma instead of greying', async () => {
  const linework = await source('game/three/pixel-art/linework.ts');
  // Round fourteen: the halo ramp fell to chroma .045 for violet skies; over crimson crowns it drew grey-taupe rings.
  assert.ok(linework.includes('glowWarmKeep: 1,') && linework.includes('uniform float glowWarmKeep;'));
  assert.ok(linework.includes('float warmGround = glowWarmKeep * (1. - smoothstep(radians(50.), radians(65.), abs(hueArc(background.z, HUE_AMBER))))'));
  assert.ok(linework.includes('halo.y = mix(halo.y, max(halo.y, background.y * mix(1., .85, t)), warmGround);'));
  // Violet and blue backgrounds keep the old ramp (no magenta rims): the hue test spans 65 degrees round amber only.
  const amber = 75, arc = (hue: number) => Math.abs(((hue - amber + 540) % 360) - 180);
  const warm = (hue: number) => 1 - Math.min(1, Math.max(0, (arc(hue) - 50) / 15));
  assert.ok(warm(28) === 1 && warm(50) === 1 && warm(300) === 0 && warm(250) === 0, 'crimson and orange count, violet does not');
});

test('lobbies light whenever the ground floors do, instead of by their seed alone', async () => {
  const materials = await source('game/three/period-city/materials.ts');
  // Round sixteen: by seed, a quarter of the lobbies stood unlit at sunrise (ground share .75), each a dark mirror metres
  // high between lit ones. Twice the ground share lights every lobby from a share of one half; 1 restores the seed test.
  assert.ok(materials.includes('export const lobbyShare = { value: 2 };'));
  assert.ok(materials.includes('float share = lobby > .5 ? min(1., cityWindows.w * cityLobbyShare) : kind > 1.5 ? cityWindows.w'));
  assert.ok(materials.includes('shader.uniforms.cityLobbyShare = lobbyShare;') && materials.includes("'period-city-window-glass-v17'"));
  // The lobby flag is set before the share reads it.
  assert.ok(materials.indexOf('lobby = step(3.5, kind) * (1. - hall);') < materials.indexOf('float share = lobby > .5'));
});

test('open water carries ripple glints of the sky over its mirror of the bank, never darker than the mirror', async () => {
  const surfaces = await source('game/three/pixel-art/surfaces.ts');
  // Round seventeen: the moat mirrored its stone wall alone and stood as a dark band at Tokyo's sunrise.
  assert.ok(surfaces.includes('waterGlint: 0.24, waterGlintLight: 0.75,'));
  assert.ok(surfaces.includes('uniform vec2 waterGlint;'));
  assert.ok(surfaces.includes('if (water && waterGlint.x > 0.) {'), 'water cells only, and off at 0');
  // Screen-row dashes (still under a still sky), the sky found straight up the cell's column past the bank.
  assert.ok(surfaces.includes('if (texelFetch(resolvedData, up, 0).w >= .5) { open = texelFetch(resolvedColor, up, 0).rgb; break; }'));
  assert.ok(surfaces.includes('reflection = max(reflection, open * waterGlint.y);'), 'brighter than the mirror, never darker');
  assert.ok(surfaces.includes('compositeUniforms.waterGlint.value.set(Math.max(0, o.waterGlint), Math.max(0, o.waterGlintLight));'));
});
