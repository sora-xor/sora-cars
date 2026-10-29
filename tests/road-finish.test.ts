import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { decorateRoadFinish, shareSpecularLimits } from '../src/game/three/road-finish';

function shader() {
  return { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<THREE.Material['onBeforeCompile']>[0];
}
const renderer = {} as THREE.WebGLRenderer;

test('road finish composes the existing shader and retains all scanned map inputs', () => {
  const map = new THREE.Texture(), normalMap = new THREE.Texture(), arm = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ color: '#96959b', map, normalMap,
    aoMap: arm, roughnessMap: arm, metalnessMap: arm, normalScale: new THREE.Vector2(.55, .55), roughness: .88, metalness: .2 });
  const originalChunks = { ...THREE.ShaderChunk }, color = material.color.clone();
  let calls = 0;
  material.onBeforeCompile = function (program, actualRenderer) {
    assert.equal(this, material); assert.equal(actualRenderer, renderer); calls++;
    program.uniforms.existingVehicleAmbient = { value: .7 };
    program.fragmentShader = '// previous source-derived ambient hook\n' + program.fragmentShader;
  };
  decorateRoadFinish(material);
  const program = shader(); material.onBeforeCompile(program, renderer);
  assert.equal(calls, 1); assert.equal(program.uniforms.existingVehicleAmbient!.value, .7);
  assert.ok(program.fragmentShader.includes('// previous source-derived ambient hook'));
  for (const chunk of ['map_fragment', 'normal_fragment_maps', 'roughnessmap_fragment', 'metalnessmap_fragment', 'aomap_fragment', 'lights_physical_fragment']) {
    assert.equal(program.fragmentShader.split(`#include <${chunk}>`).length, 2, `${chunk} remains in the PBR pipeline`);
  }
  assert.deepEqual([material.map, material.normalMap, material.aoMap, material.roughnessMap, material.metalnessMap], [map, normalMap, arm, arm, arm]);
  assert.deepEqual(material.color, color); assert.deepEqual(material.normalScale.toArray(), [.55, .55]);
  assert.equal(material.roughness, .88); assert.equal(material.metalness, 0);
  assert.deepEqual(THREE.ShaderChunk, originalChunks);
});

test('weather and A/B toggles update existing uniforms without reallocating maps or recompiling', () => {
  const material = new THREE.MeshStandardMaterial(), finish = decorateRoadFinish(material), compile = material.onBeforeCompile;
  const version = material.version, first = shader(), second = shader();
  assert.equal(decorateRoadFinish(material), finish); assert.equal(material.onBeforeCompile, compile);
  material.onBeforeCompile(first, renderer); material.onBeforeCompile(second, renderer);
  assert.equal(first.uniforms.soraRoadWetness, second.uniforms.soraRoadWetness);
  assert.equal(first.uniforms.soraRoadFinishEnabled, second.uniforms.soraRoadFinishEnabled);
  for (const [input, expected] of [[-.5, 0], [.35, .35], [2, 1], [NaN, 0]]) {
    finish.setWetness(input!); assert.equal(first.uniforms.soraRoadWetness!.value, expected);
  }
  finish.setEnabled(false); assert.equal(first.uniforms.soraRoadFinishEnabled!.value, 0);
  finish.setEnabled(true); assert.equal(second.uniforms.soraRoadFinishEnabled!.value, 1);
  assert.equal(material.version, version);
});

test('distinct original hooks retain distinct default keys and authored custom keys remain dynamic', () => {
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial(), c = new THREE.MeshStandardMaterial();
  a.onBeforeCompile = program => { program.fragmentShader = '// first\n' + program.fragmentShader; };
  b.onBeforeCompile = program => { program.fragmentShader = '// second\n' + program.fragmentShader; };
  const first = a.customProgramCacheKey(), second = b.customProgramCacheKey();
  let variant = 'dry-source'; c.customProgramCacheKey = function () { assert.equal(this, c); return variant; };
  [a, b, c].forEach(decorateRoadFinish);
  assert.equal(a.customProgramCacheKey(), `${first}:sora-road-finish-v5`);
  assert.equal(b.customProgramCacheKey(), `${second}:sora-road-finish-v5`);
  assert.notEqual(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(c.customProgramCacheKey(), 'dry-source:sora-road-finish-v5');
  variant = 'patched-source'; assert.equal(c.customProgramCacheKey(), 'patched-source:sora-road-finish-v5');
});

test('an incompatible custom shader fails before a partial road-finish injection', () => {
  const material = new THREE.MeshStandardMaterial(); decorateRoadFinish(material);
  const program = { vertexShader: 'void main(){}', fragmentShader: 'void main(){}', uniforms: {} } as ReturnType<typeof shader>;
  const before = structuredClone(program);
  assert.throws(() => material.onBeforeCompile(program, renderer), /Unsupported road material shader layout/);
  assert.deepEqual(program, before);
});

test('the key light specular ceiling wraps only the directional light and leaves spot highlights intact', () => {
  const material = new THREE.MeshStandardMaterial(), finish = decorateRoadFinish(material), program = shader();
  material.onBeforeCompile(program, renderer);
  const source = program.fragmentShader;
  const pars = source.indexOf('#include <lights_physical_pars_fragment>'), wrapper = source.indexOf('void soraRoadDirect(');
  assert.ok(pars >= 0 && wrapper > pars, 'the wrapper follows the physical BRDF definitions');
  assert.ok(source.indexOf('#define RE_Direct soraRoadDirect') > wrapper);
  assert.ok(source.includes('#define getDirectionalLightInfo soraRoadKeyLightInfo'));
  assert.ok(!source.includes('getSpotLightInfo soraRoad'), 'spot lights are not redirected');
  assert.equal(source.split('#include <lights_fragment_begin>').length, 2, 'the light loop include stays for later hooks');
  for (const [input, expected] of [[.25, .25], [-1, 0], [NaN, 0], [3, 3]] as const) {
    finish.setKeySpecularLimit(input); assert.equal(program.uniforms.soraRoadKeySpecular!.value, expected);
  }
});

test('the spot and area-light specular ceiling is off by default and wraps the rect-area BRDF', () => {
  const material = new THREE.MeshStandardMaterial(), finish = decorateRoadFinish(material), program = shader();
  material.onBeforeCompile(program, renderer);
  const source = program.fragmentShader;
  assert.equal(program.uniforms.soraRoadSpotSpecular!.value, 0);
  assert.ok(source.includes('#define RE_Direct_RectArea soraRoadRectArea'));
  assert.ok(source.indexOf('void soraRoadRectArea(') > source.indexOf('#include <lights_physical_pars_fragment>'));
  for (const [input, expected] of [[.12, .12], [-1, 0], [NaN, 0]] as const) {
    finish.setSpotSpecularLimit(input); assert.equal(program.uniforms.soraRoadSpotSpecular!.value, expected);
  }
});

test('kerbs and the gutter strip share the road ceilings without its damp patches (R3 shoulder glare)', () => {
  const road = new THREE.MeshStandardMaterial(), finish = decorateRoadFinish(road);
  const kerb = new THREE.MeshStandardMaterial({ roughness: .92 });
  let previous = 0;
  kerb.onBeforeCompile = program => { previous++; program.uniforms.existingVehicleAmbient = { value: .5 }; };
  const key = kerb.customProgramCacheKey();
  shareSpecularLimits(kerb, finish);
  const compile = kerb.onBeforeCompile;
  shareSpecularLimits(kerb, finish);
  assert.equal(kerb.onBeforeCompile, compile, 'sharing twice does not wrap twice');
  assert.equal(kerb.customProgramCacheKey(), `${key}:sora-road-ceiling-v1`);
  const roadProgram = shader(), kerbProgram = shader();
  road.onBeforeCompile(roadProgram, renderer); kerb.onBeforeCompile(kerbProgram, renderer);
  assert.equal(previous, 1); assert.equal(kerbProgram.uniforms.existingVehicleAmbient!.value, .5);
  for (const name of ['soraRoadKeySpecular', 'soraRoadSpotSpecular', 'soraRoadFinishEnabled']) {
    assert.equal(kerbProgram.uniforms[name], roadProgram.uniforms[name], `${name} is the road's own uniform`);
  }
  finish.setKeySpecularLimit(.06); assert.equal(kerbProgram.uniforms.soraRoadKeySpecular!.value, .06);
  const source = kerbProgram.fragmentShader;
  assert.ok(source.indexOf('#define RE_Direct soraRoadDirect') > source.indexOf('#include <lights_physical_pars_fragment>'));
  assert.ok(!source.includes('soraRoadPatch'), 'no damp patches on the kerb');
  assert.equal(kerbProgram.uniforms.soraRoadWetness, undefined);
  assert.equal(kerb.roughness, .92);
  // The road itself is never wrapped twice.
  const roadCompile = road.onBeforeCompile; shareSpecularLimits(road, finish);
  assert.equal(road.onBeforeCompile, roadCompile);
});
