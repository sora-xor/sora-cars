import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CANOPY_GAP_SHARE, canopyDepthMaterial, setCanopyGapLight, setCanopyGapShare, withCanopyGaps } from '../src/game/three/canopy-gaps';

function compile(material: THREE.MeshDepthMaterial) {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.depth.vertexShader,
    fragmentShader: THREE.ShaderLib.depth.fragmentShader,
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  return shader;
}

test('every crown shadow pass shares one gap field that discards leaves in it', () => {
  const solid = compile(canopyDepthMaterial());
  const cards = compile(withCanopyGaps(new THREE.MeshDepthMaterial({ alphaTest: .5 })));
  for (const shader of [solid, cards]) {
    assert.match(shader.vertexShader, /vCanopyWorld = \(modelMatrix \* world\)\.xyz;/);
    assert.match(shader.vertexShader, /world = batchingMatrix \* world;/);
    assert.match(shader.vertexShader, /world = instanceMatrix \* world;/);
    assert.match(shader.fragmentShader, /> canopyGapThreshold\) discard;/);
  }
  // One set of uniforms: the light and the share reach the closed-leaf crowns and the leaf cards alike.
  for (const name of ['canopyGapAcross', 'canopyGapAlong', 'canopyGapThreshold'])
    assert.equal(solid.uniforms[name], cards.uniforms[name], name);
  assert.equal(canopyDepthMaterial(), canopyDepthMaterial());
});

test('the gap field lies across the key light, so a gap opens a whole sunbeam', () => {
  const { uniforms } = compile(canopyDepthMaterial());
  const across = uniforms.canopyGapAcross!.value as THREE.Vector3, along = uniforms.canopyGapAlong!.value as THREE.Vector3;
  for (const direction of [new THREE.Vector3(.75, .5, -.43).normalize(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-.2, .1, .97).normalize()]) {
    setCanopyGapLight(direction);
    for (const axis of [across, along]) {
      assert.ok(Math.abs(axis.length() - 1) < 1e-6, 'unit axis');
      assert.ok(Math.abs(axis.dot(direction)) < 1e-6, 'across the light');
    }
    assert.ok(Math.abs(across.dot(along)) < 1e-6, 'orthogonal axes');
  }
});

test('the open share sets the threshold: none closes every crown, more opens more', () => {
  const { uniforms } = compile(canopyDepthMaterial());
  const threshold = (share: number) => { setCanopyGapShare(share); return uniforms.canopyGapThreshold!.value as number; };
  // The field's noise never exceeds 1, so a threshold above it keeps the crowns solid.
  assert.ok(threshold(0) > 1);
  assert.ok(threshold(Number.NaN) > 1);
  assert.ok(threshold(.6) < threshold(.5) && threshold(.5) < threshold(.2));
  assert.ok(Math.abs(threshold(.5) - .5) < .01, 'half the field open at its median');
  setCanopyGapShare(CANOPY_GAP_SHARE);
});
