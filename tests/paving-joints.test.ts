import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { KERB_STONE, KERB_STONE_END, PAVING_JOINTS_GLSL, WALK_SLAB, decorateKerb, pavingUniforms } from '../src/game/three/paving-joints';

const compile = (material: THREE.Material) => {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
};

test('the kerb is stones and slabs: joints, a tone each, and the live controls', () => {
  const material = new THREE.MeshStandardMaterial();
  decorateKerb(material);
  const shader = compile(material);
  assert.equal(material.customProgramCacheKey(), 'sora-kerb-stones-v1');
  assert.ok(shader.vertexShader.includes('attribute float roadEdge;') && shader.vertexShader.includes('soraKerbAlong = uv.x * 2.4;'));
  assert.ok(shader.fragmentShader.includes(PAVING_JOINTS_GLSL) && shader.fragmentShader.includes('soraJoint('));
  // One shared pair of uniforms drives every jointed material.
  assert.equal(shader.uniforms.soraPavingStrength, pavingUniforms.soraPavingStrength);
  assert.equal(shader.uniforms.soraPavingTravel, pavingUniforms.soraPavingTravel);
  assert.equal(pavingUniforms.soraPavingStrength.value, 1);
  // Kerb stones longer than the walkway's slabs; three rows of slabs fit the walkway (1.6 m less the kerb).
  assert.ok(KERB_STONE > WALK_SLAB[0] && Math.abs((1.6 - KERB_STONE_END) / WALK_SLAB[1] - 3) < 0.01);
});

test('cross joints fade at speed, and joints stay about a cell wide', () => {
  // Under 0.3 slab lengths per tick everything shows; over 0.6 the cross joints are gone.
  assert.ok(PAVING_JOINTS_GLSL.includes('1. - smoothstep(.3, .6, abs(travel))'));
  // A joint spans at least two scene pixels (one art cell at the least supersample), fading where slabs are small.
  assert.ok(PAVING_JOINTS_GLSL.includes('max(width, footprint * 2.)') && PAVING_JOINTS_GLSL.includes('smoothstep(.1, .22, footprint)'));
});

test('the roadside kerb carries its distance beyond the road edge; the urban frontage draws flags', async () => {
  // Both modules load scanned textures on import of their materials, so their wiring is checked in the source.
  const read = (file: string) => readFile(new URL(`../src/game/three/${file}`, import.meta.url), 'utf8');
  const [infrastructure, paving, world] = await Promise.all([read('infrastructure.ts'), read('urban-paving.ts'), read('world.ts')]);
  assert.ok(infrastructure.includes('decorateKerb(concrete);'));
  assert.ok(infrastructure.includes("geometry.setAttribute('roadEdge', new THREE.Float32BufferAttribute(edges, 1));"));
  // The kerb's profile starts a quarter of a metre beyond the road edge and ends within the pattern's 1.7 m.
  assert.ok(infrastructure.includes("[[0.25, -0.04], [0.25, 0.12], [0.31, 0.18], [1.6, 0.18], [1.67, 0.1], [1.67, -0.04]], side, 'Beveled curb and sidewalk'"));
  assert.ok(paving.includes('sharePavingUniforms(shader);') && paving.includes("'sora-urban-frontage-paving-v2'"));
  assert.ok(paving.includes('soraUrbanWorld = (modelMatrix * vec4(position, 1.0)).xz;'));
  // The world feeds the travel per tick each frame.
  assert.ok(world.includes('pavingUniforms.soraPavingTravel.value.set(Math.sin(at.heading), Math.cos(at.heading)).multiplyScalar(player.speed / 30);'));
});
