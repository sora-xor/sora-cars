import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { installSpotlightEarlyOut } from '../src/game/three/spotlight-shading';

const directCall = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const guard = `if ( directLight.visible ) { ${directCall} }`;

function fixture() {
  const calls: unknown[][] = [];
  const renderer = { renderBufferDirect(...args: unknown[]) {
    assert.equal(this, renderer);
    calls.push(args);
  } } as unknown as THREE.WebGLRenderer;
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
  const submit = (material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    const group = { start: 0, count: geometry.index!.count, materialIndex: 0 };
    renderer.renderBufferDirect(camera, scene, geometry, material, mesh, group);
    assert.deepEqual(calls.at(-1), [camera, scene, geometry, material, mesh, group]);
  };
  const shader = () => ({ fragmentShader: '#include <lights_fragment_begin>', vertexShader: '', uniforms: {} }) as Parameters<THREE.Material['onBeforeCompile']>[0];
  return { renderer, submit, shader };
}

test('spotlight guard preserves the entire Three light chunk except the one BRDF call', () => {
  const f = fixture(), material = new THREE.MeshPhysicalMaterial({ clearcoat: 1, sheen: 1 });
  const original = THREE.ShaderChunk.lights_fragment_begin;
  installSpotlightEarlyOut(f.renderer);
  f.submit(material);
  const shader = f.shader();
  material.onBeforeCompile(shader, f.renderer);
  assert.equal(shader.fragmentShader.split(guard).length, 2);
  assert.equal(shader.fragmentShader.replace(guard, directCall), original);
  const start = original.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )');
  const end = original.indexOf('#pragma unroll_loop_end', start);
  assert.ok(shader.fragmentShader.indexOf(guard) > start);
  assert.ok(shader.fragmentShader.indexOf(guard) < end + guard.length);
  assert.equal(THREE.ShaderChunk.lights_fragment_begin, original);
});

test('late materials preserve their existing hooks and keys, decorate once, and remain renderer scoped', () => {
  const f = fixture(), other = fixture(), material = new THREE.MeshStandardMaterial();
  let compiled = 0;
  material.onBeforeCompile = function (shader) {
    assert.equal(this, material);
    compiled++;
    shader.uniforms.existingDissolve = { value: 0.4 };
    shader.fragmentShader = '// existing AO, oil or dissolve hook\n' + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => 'existing-material-variant';
  installSpotlightEarlyOut(f.renderer);
  const wrapper = f.renderer.renderBufferDirect;
  installSpotlightEarlyOut(f.renderer);
  assert.equal(f.renderer.renderBufferDirect, wrapper);
  f.submit(material);
  const version = material.version, compile = material.onBeforeCompile;
  f.submit(material);
  assert.equal(material.version, version);
  assert.equal(material.onBeforeCompile, compile);
  assert.equal(material.customProgramCacheKey(), 'existing-material-variant:sora-spotlight-early-out-v1');
  const shader = f.shader();
  material.onBeforeCompile(shader, f.renderer);
  assert.equal(compiled, 1);
  assert.equal(shader.uniforms.existingDissolve!.value, 0.4);
  assert.ok(shader.fragmentShader.startsWith('// existing AO, oil or dissolve hook\n'));
  assert.ok(shader.fragmentShader.includes(guard));
  const elsewhere = f.shader();
  material.onBeforeCompile(elsewhere, other.renderer);
  assert.ok(elsewhere.fragmentShader.endsWith('#include <lights_fragment_begin>'));
  assert.ok(!elsewhere.fragmentShader.includes(guard));
});

test('depth, basic, and custom shader passes retain their original material behavior', () => {
  const f = fixture();
  installSpotlightEarlyOut(f.renderer);
  for (const material of [new THREE.MeshDepthMaterial(), new THREE.MeshBasicMaterial(), new THREE.ShaderMaterial()]) {
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey, version = material.version;
    f.submit(material);
    assert.equal(material.onBeforeCompile, compile);
    assert.equal(material.customProgramCacheKey, key);
    assert.equal(material.version, version);
  }
});

test('distinct original default hooks retain distinct keys and custom keys remain dynamic', () => {
  const f = fixture(), first = new THREE.MeshStandardMaterial(), second = new THREE.MeshStandardMaterial();
  first.onBeforeCompile = shader => { shader.fragmentShader = '// first\n' + shader.fragmentShader; };
  second.onBeforeCompile = shader => { shader.fragmentShader = '// second\n' + shader.fragmentShader; };
  const keys = [first.customProgramCacheKey(), second.customProgramCacheKey()];
  assert.notEqual(keys[0], keys[1]);
  installSpotlightEarlyOut(f.renderer);
  f.submit(first); f.submit(second);
  assert.equal(first.customProgramCacheKey(), `${keys[0]}:sora-spotlight-early-out-v1`);
  assert.equal(second.customProgramCacheKey(), `${keys[1]}:sora-spotlight-early-out-v1`);
  assert.notEqual(first.customProgramCacheKey(), second.customProgramCacheKey());

  const dynamic = new THREE.MeshStandardMaterial();
  dynamic.userData.shaderVariant = 'dry';
  dynamic.customProgramCacheKey = function () { return `wet-road:${this.userData.shaderVariant}`; };
  f.submit(dynamic);
  assert.equal(dynamic.customProgramCacheKey(), 'wet-road:dry:sora-spotlight-early-out-v1');
  dynamic.userData.shaderVariant = 'wet';
  assert.equal(dynamic.customProgramCacheKey(), 'wet-road:wet:sora-spotlight-early-out-v1');
});
