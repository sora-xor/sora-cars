import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compileFor, materialTextures, shadowCasterBatches } from '../src/game/three/shader-warmup';

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  scene.fog = new THREE.FogExp2('#797087', 0.005);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const leafMap = new THREE.Texture(), leafAlpha = new THREE.Texture();
  const leaves = new THREE.MeshStandardMaterial({ map: leafMap, alphaMap: leafAlpha, alphaTest: 0.4, side: THREE.DoubleSide });
  const paint = new THREE.MeshStandardMaterial({ color: '#c33' });
  return { scene, camera, box, leaves, paint, leafMap, leafAlpha };
}

test('stand-ins wear the depth material the shadow pass gives each surface and inherit the rest', () => {
  const { scene, box, leaves, paint, leafMap, leafAlpha } = fixture();
  const crown = new THREE.InstancedMesh(box, leaves, 4); crown.castShadow = true;
  const body = new THREE.Mesh(box, paint); body.castShadow = true;
  const glass = new THREE.Mesh(box, new THREE.MeshStandardMaterial()); // no shadow
  // A tree batch's source: never drawn itself, but the hazard trees cloned from it cast shadows without instancing.
  const source = new THREE.Mesh(box, leaves); source.castShadow = true; source.layers.mask = 0;
  const twin = new THREE.Mesh(box, paint); twin.castShadow = true; // the body's program again
  scene.add(crown, body, glass, source, twin);
  const batches = shadowCasterBatches(scene);
  assert.equal(batches.length, 1);
  const standIns = batches[0]!() as THREE.Mesh[];
  assert.equal(standIns.length, 3, 'one per program: none for non-casters or repeats, one for the hidden source');
  assert.equal((standIns[2] as THREE.InstancedMesh).isInstancedMesh, undefined);
  const [leafShadow, bodyShadow] = standIns.map(standIn => standIn.material as THREE.MeshDepthMaterial);
  // WebGLShadowMap's getDepthMaterial: the surface's maps and alpha test; PCF flips the side.
  assert.ok(leafShadow instanceof THREE.MeshDepthMaterial);
  assert.equal(leafShadow.map, leafMap); assert.equal(leafShadow.alphaMap, leafAlpha); assert.equal(leafShadow.alphaTest, 0.4);
  assert.equal(leafShadow.side, THREE.DoubleSide);
  assert.equal(bodyShadow.side, THREE.BackSide); assert.equal(bodyShadow.map, null);
  // Everything else comes from the caster, so the program keys match its shadow draws.
  assert.equal((standIns[0] as THREE.InstancedMesh).isInstancedMesh, true);
  assert.equal(standIns[0]!.geometry, box);
  assert.equal(crown.material, leaves, 'the casters themselves are untouched');
});

test('a custom depth material shared by different surfaces compiles each of its programs in its own batch', () => {
  const { scene, box, leaves, paint } = fixture();
  const shared = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  for (const material of [leaves, paint, leaves]) {
    const mesh = new THREE.Mesh(box, material); mesh.castShadow = true; mesh.customDepthMaterial = shared; scene.add(mesh);
  }
  const plain = new THREE.Mesh(box, paint); plain.castShadow = true; scene.add(plain);
  const batches = shadowCasterBatches(scene);
  assert.equal(batches.length, 2, 'two configurations of the shared material; repeats of one compile once');
  const first = batches[0]!() as THREE.Mesh[];
  assert.equal(first.filter(standIn => standIn.material === shared).length, 1);
  assert.equal((shared as THREE.MeshDepthMaterial).alphaTest, 0.4, 'dressed for the leaves when its batch compiles');
  const second = batches[1]!() as THREE.Mesh[];
  assert.deepEqual(second.map(standIn => standIn.material), [shared]);
  assert.equal(shared.alphaTest, 0, 'then for the paint');
  assert.equal(shared.side, THREE.BackSide);
});

test('compileFor compiles only the given objects, against the scene\'s lights, and restores the fog', async () => {
  const { scene, camera, box, paint } = fixture();
  const fog = scene.fog;
  const compiled: { objects: THREE.Object3D[]; target: THREE.Scene | null; fog: THREE.Fog | THREE.FogExp2 | null }[] = [];
  const renderer = {
    compileAsync(group: THREE.Scene, _camera: THREE.Camera, target: THREE.Scene | null) {
      const objects: THREE.Object3D[] = []; group.traverse(object => objects.push(object));
      compiled.push({ objects, target, fog: target?.fog ?? null });
      return Promise.resolve(group);
    },
  } as unknown as THREE.WebGLRenderer;
  const mesh = new THREE.Mesh(box, paint);
  await compileFor(renderer, scene, camera, [mesh], { fog: false });
  await compileFor(renderer, scene, camera, [mesh]);
  await compileFor(renderer, scene, camera, []);
  assert.equal(compiled.length, 2, 'nothing to compile, no call');
  assert.deepEqual(compiled[0]!.objects, [mesh]);
  assert.equal(compiled[0]!.target, scene);
  assert.equal(compiled[0]!.fog, null, 'the shadow pass draws without fog');
  assert.equal(compiled[1]!.fog, fog);
  assert.equal(scene.fog, fog);
});

test('the warm-up uploads every texture a material samples, hidden objects and shader uniforms included', () => {
  const { scene, box, leaves, paint, leafMap, leafAlpha } = fixture();
  const normal = new THREE.Texture(), palette = new THREE.Texture();
  const bark = new THREE.MeshStandardMaterial({ map: leafMap, normalMap: normal });
  const hidden = new THREE.Mesh(box, leaves); hidden.visible = false; // pooled understory, drawn later in the lap
  const shader = new THREE.ShaderMaterial({ uniforms: { palette: { value: palette }, strength: { value: 1 } } });
  scene.add(new THREE.Mesh(box, [paint, bark]), new THREE.Group().add(hidden), new THREE.Mesh(box, shader));
  assert.deepEqual(new Set(materialTextures(scene)), new Set([leafMap, normal, leafAlpha, palette]));
  assert.equal(materialTextures(scene).length, 4, 'each texture once');
});

test('before GO the warm-up uploads only what visible objects near the start sample', () => {
  const { scene, box, leaves, paint, leafMap, leafAlpha } = fixture();
  const far = new THREE.Texture(), shut = new THREE.Texture(), lane = new THREE.Texture();
  const shop = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ map: far })); shop.position.set(900, 0, 0);
  const pooled = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ map: shut })); pooled.visible = false;
  // A route-long instanced understory: its instances reach the start even though its origin is far away.
  const cover = new THREE.InstancedMesh(box, leaves, 2); cover.position.set(0, 0, 2000);
  cover.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -2000)); cover.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 500));
  const road = new THREE.Mesh(box, [paint, new THREE.MeshStandardMaterial({ map: lane })]); road.position.set(0, 0, 50);
  // An understory pool, empty and hidden until its patches arrive near the car.
  const grass = new THREE.Texture(), pool = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ alphaMap: grass }), 8);
  pool.count = 0; pool.visible = false; pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Static instancing far down the route (a shop's props) waits for its first sight.
  const props = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: far }), 1); props.position.set(0, 0, 3000);
  scene.add(shop, pooled, cover, road, pool, props);
  scene.updateMatrixWorld(true);
  const near = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 400);
  assert.deepEqual(new Set(materialTextures(scene, near)), new Set([leafMap, leafAlpha, lane, grass]));
});
