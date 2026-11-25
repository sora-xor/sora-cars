import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SURFACE_DEFAULTS } from '../src/game/three/pixel-art/surfaces';
import { BALLOON_CROWN_GLOW, BALLOON_RADIUS, BALLOON_UNDER_GLOW } from '../src/game/three/period-city/sky';

const source = (file: string) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('round nineteen: the wet road carries more, thinner streaks; the column thresholds stay as they were', async () => {
  const d = SURFACE_DEFAULTS;
  // 3.5 cells apart with a faint slow octave (were 5 and .5).
  assert.equal(d.wetWaveStreak, 3.5); assert.equal(d.wetStreakVariety, .2);
  // Road and water keep the earlier column thresholds and fade (higher ones for the road were tried and dropped).
  assert.equal(d.wetColumnStart, .15); assert.equal(d.wetColumnFull, .4); assert.equal(d.wetColumnFade, 3.5);
  assert.ok(!('wetRoadColumnStart' in d));
});

test('round nineteen: the trough mirror (off by default) keeps a capped, navy share of the cell’s own mirror inside a column', async () => {
  assert.equal(SURFACE_DEFAULTS.wetTroughMirror, 0);
  const surfaces = await source('game/three/pixel-art/surfaces.ts');
  // The cell's own reflection is the trace at dy 0, kept before the brightest source is chosen.
  assert.ok(surfaces.includes('if (dy == 0) local = trace.rgb;'));
  // Only inside a light's column (not wherever the stones' own mirror share is 0, as with wetStoneMirror 0).
  assert.ok(surfaces.includes('if (!litStone && (stretched || lampWon) && stoneEdgeKind < 2 && troughMirror > 0.) {'));
  assert.ok(surfaces.includes('vec3 kept = local * fresnel * fields.y * columnParams.z * troughMirror;'));
  // Under the damp-patch cap, never darker than the trough share; only the kept share is toned navy, so a black local
  // sample leaves the column's trough unchanged at any share.
  assert.ok(surfaces.includes('if (kl > cap) kept *= cap / kl;') && surfaces.includes('reflection = max(reflection, kept);'));
  assert.ok(surfaces.includes('if (stoneCool > 0.) kept = mix(kept, vec3(.2, .26, .62) * (artLuminance(kept) / .2732), stoneCool);'));
  assert.ok(surfaces.includes('if (!litStone && own > 0. && stoneCool > 0.) {'));
  assert.ok(surfaces.includes('compositeUniforms.troughMirror.value = THREE.MathUtils.clamp(o.wetTroughMirror, 0, 1);'));
});

test('round nineteen: ad balloons are 4 m across and floodlit from below, not glowing evenly like the moon', async () => {
  assert.equal(BALLOON_RADIUS, 2);
  // Seen from the street, the floodlit belly is what shows: dimmer than the old even glow (1), the crown nearly dark.
  assert.ok(BALLOON_UNDER_GLOW < 1 && BALLOON_CROWN_GLOW < .1);
  const sky = await source('game/three/period-city/sky.ts');
  assert.ok(sky.includes('new THREE.SphereGeometry(BALLOON_RADIUS, 16, 12)'));
  assert.ok(sky.includes('float below = -transformNormalByInverseViewMatrix(normal, viewMatrix).y;'));
  assert.ok(sky.includes("'period-sky-balloons-v2'"));
  // The tether meets the balloon at its foot.
  assert.ok(sky.includes('top.clone().setY(top.y - BALLOON_RADIUS * 1.08)'));
});

test('round nineteen: plants other than the maples take a share of the spot lights, through the spot light lookup', async () => {
  const { floraPlantSpot } = await import('../src/game/three/period-city/flora');
  assert.equal(floraPlantSpot.value, .35);
  const flora = await source('game/three/period-city/flora.ts');
  // Non-maple cards (leafCentre.w 1: susuki, grass, bushes, conifers) have vSoraLeaf -1; the maples keep their lamp light.
  assert.ok(flora.includes('if ( vSoraLeaf < 0. ) incident.color *= soraPlantSpot;'));
  assert.ok(flora.includes('void soraPlantSpotInfo( const in SpotLight spot, const in vec3 position, out IncidentLight incident ) {'));
  // The lights include stays in place, wrapped by the macro, so the spot light early-out (spotlight-shading.ts) still applies.
  assert.ok(flora.includes("'#define getSpotLightInfo( a, b, c ) soraPlantSpotInfo( a, b, c )\\n#include <lights_fragment_begin>\\n#undef getSpotLightInfo'"));
  assert.ok(flora.includes("'period-flora-leaves-v7'"));
});

test('round nineteen: the popcorn fills more of the sky and reaches the frame’s top, and 0 restores the earlier sky', async () => {
  const { createPaintedSky } = await import('../src/poc/painted-sky');
  const sky = createPaintedSky(), material = sky.mesh.material as unknown as { uniforms: Record<string, { value: unknown }>; fragmentShader: string };
  assert.equal(sky.racePopcornFill.value, .7);
  assert.equal(material.uniforms.skyRacePopcornFill, sky.racePopcornFill);
  const glsl = material.fragmentShader;
  // At 0 the gate, the share kept and the ceiling are the earlier .35-.6, .9 and .36.
  assert.ok(glsl.includes('float keep = band * smoothstep(.35 - .27 * fill, .6 - .27 * fill, group) * mix(.9, .97, fill);'));
  assert.ok(glsl.includes('angular.y > mix(.36, .52, clamp(skyRacePopcornFill, 0., 1.))) return sky;'));
  // With any fill, lobes thin out before that ceiling, so it never cuts one; at 0 the earlier path is untouched.
  assert.ok(glsl.includes('if (fill > 0.) keep *= 1. - smoothstep(mix(.36, .52, fill) - .07, mix(.36, .52, fill) - .012, lift);'));
  sky.dispose();
});
