import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { BODY_IDS, practiceCars, rivalCar, stockBuild, storyCar, validateCarBuild, type BodyId, type CarBuild } from '../game/car-builds';
import { storyGrid } from '../game/story';
import { addDissolve, carNight, loadDetailedCar, setDetailedCarNight } from '../game/three/asset-car';
import type { CarModel } from '../game/three/car';
import { createDuskEnvironment } from '../game/three/dusk-environment';
import { createPeriodCar } from '../game/three/period-cars/model';
import { soraEmblemTexture, soraStripTexture } from '../game/three/sora-emblem';

/**
 * Car lab (car-lab.html): every period body side by side, or one build on a turntable, under the race's dusk HDR.
 * `?body=<id>` shows one body, `?build=<json>` one build, `?seed=<n>` a rival's car; `?view=side|rear|front|top|three`.
 * window.carLab drives it from the browser tools.
 */
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
const canvas = document.querySelector<HTMLCanvasElement>('#car-lab')!, info = document.querySelector<HTMLElement>('#lab-info')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a2440');
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
const key = new THREE.DirectionalLight('#ffd9b0', 2.4); key.position.set(-6, 9, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -16, right: 16, top: 10, bottom: -10, near: 1, far: 40 });
scene.add(key, new THREE.HemisphereLight('#b9b4ff', '#3a2a36', 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: '#4a4652', roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
new HDRLoader().load(asset('lighting/qwantani-dusk.hdr'), texture => {
  const target = createDuskEnvironment(renderer, texture); texture.dispose();
  scene.environment = target.texture; scene.environmentIntensity = 0.5;
});
const flag = new THREE.TextureLoader().load(asset('sora-flag.png')); flag.colorSpace = THREE.SRGBColorSpace;
const emblemUrl = asset('branding/sora-emblem-source.png');
const decals = { flag, emblem: soraEmblemTexture(emblemUrl, 512, .3), strip: soraStripTexture(emblemUrl) };
const hooks = { dissolve: addDissolve, night: carNight };
setDetailedCarNight(0.6);

const params = new URLSearchParams(location.search);
let cars: { model: CarModel; build: CarBuild }[] = [];
let view = params.get('view') ?? 'three', spin = params.has('spin'), angle = 0;
async function make(build: CarBuild): Promise<CarModel> {
  if (build.body === 'hachiroku') return loadDetailedCar(build, decals.flag, decals.emblem, decals.strip);
  return createPeriodCar(build.body, build, decals, hooks);
}
async function show(builds: CarBuild[]): Promise<void> {
  for (const { model } of cars) { scene.remove(model.group); model.dispose?.(); }
  const made = await Promise.all(builds.map(make));
  cars = made.map((model, i) => ({ model, build: builds[i]! }));
  // Side by side across the view; nose to tail for a side view.
  const side = view === 'side', spacing = builds.length > 1 ? side ? 4.9 : 2.4 : 0;
  cars.forEach(({ model }, i) => {
    const offset = (i - (cars.length - 1) / 2) * spacing;
    model.group.position.set(side ? 0 : offset, 0, side ? offset : 0);
    model.animate(0, 0, false, false, 0); scene.add(model.group);
  });
  model3();
}
function model3(): void {
  info.textContent = cars.map(({ build }) => `${build.body} ${build.paint} wheels:${build.wheels} ${build.stance}`).join('\n');
}
function frameCamera(): void {
  const wide = cars.length > 1, width = wide ? cars.length * (view === 'side' ? 4.9 : 2.4) : 5, aspect = innerWidth / innerHeight;
  const distance = Math.max(width / aspect / Math.tan(THREE.MathUtils.degToRad(15)) * 0.62, 7.5);
  const look = new THREE.Vector3(0, 0.62, 0);
  const at = { side: [-distance, 0.9, 0], rear: [0, 1.6, -distance], front: [0, 1.2, distance], top: [0.01, distance * 1.2, 0], three: [-distance * 0.62, distance * 0.36, distance * 0.7], chase: [0, 2.2, -7.5] }[view] ?? [-distance * 0.6, 3, distance * 0.7];
  camera.position.set(at[0]!, at[1]!, at[2]!);
  camera.lookAt(look);
}
function resize(): void { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function frame(time: number): void {
  if (spin) { angle += 0.01; for (const { model } of cars) model.group.rotation.y = angle; }
  frameCamera();
  for (const { model } of cars) model.animate(0, 0, false, false, time / 1000);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const fromParams = (): CarBuild[] => {
  if (params.has('build')) return [validateCarBuild(JSON.parse(params.get('build')!))];
  if (params.has('seed')) return [rivalCar(Number(params.get('seed')), Number(params.get('flair') ?? 1))];
  if (params.has('body')) return [stockBuild(Number(params.get('livery') ?? 0), params.get('body') as BodyId)];
  // `?grid=story&chapter=n`: that chapter's Arcade grid (the player's slot shows the factory car); `?grid=<field>`: a practice field.
  if (params.get('grid') === 'story') return storyGrid(Number(params.get('chapter') ?? 11)).map((name, slot) => storyCar(name) ?? stockBuild(slot % 6));
  if (params.has('grid')) return practiceCars(params.get('grid')!, 8, 6, stockBuild(0));
  return BODY_IDS.map((body, i) => stockBuild(i % 6, body));
};
void show(fromParams());

/** Measures the detailed hachiroku: its paint's outline along the length, for hachiroku.ts. */
async function measureHachiroku(): Promise<unknown> {
  const model = await loadDetailedCar(stockBuild(0), decals.flag, decals.emblem, decals.strip);
  model.group.updateMatrixWorld(true);
  const paint: THREE.Mesh[] = [], glass: THREE.Mesh[] = [], all: THREE.Mesh[] = [];
  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const name = (object.material as THREE.Material).name;
    if (name === 'Primary') paint.push(object); if (name === 'Windows') glass.push(object);
    if (!object.name.includes('decal') && !object.name.includes('flag') && !object.name.includes('emblem')) all.push(object);
  });
  const ray = new THREE.Raycaster(), hit = (targets: THREE.Mesh[], from: THREE.Vector3, dir: THREE.Vector3) => { ray.set(from, dir); return ray.intersectObjects(targets, false)[0]?.point ?? null; };
  const rows: Record<string, number | null>[] = [];
  for (let z = -2.1; z <= 2.11; z += 0.1) {
    const top = hit(all, new THREE.Vector3(0, 3, z), new THREE.Vector3(0, -1, 0));
    const topSide = hit(all, new THREE.Vector3(0.45, 3, z), new THREE.Vector3(0, -1, 0));
    const glassTop = hit(glass, new THREE.Vector3(0, 3, z), new THREE.Vector3(0, -1, 0));
    const side = (y: number) => hit(all, new THREE.Vector3(3, y, z), new THREE.Vector3(-1, 0, 0))?.x ?? null;
    rows.push({ z: Math.round(z * 100) / 100, top: top?.y ?? null, top45: topSide?.y ?? null, glass: glassTop?.y ?? null,
      x30: side(0.3), x45: side(0.45), x60: side(0.6), x75: side(0.75), x85: side(0.85), x95: side(0.95), x110: side(1.1) });
  }
  const box = new THREE.Box3().setFromObject(model.group);
  const wheels = (model.group.userData.tyreContacts as number[][]).map(c => c.map(v => Math.round(v * 1000) / 1000));
  const driver = new THREE.Box3(); model.group.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) driver.expandByObject(o); });
  return { box: [box.min.toArray(), box.max.toArray()], wheels, driver: [driver.min.toArray(), driver.max.toArray()], rows };
}

declare global { interface Window { carLab: unknown } }
window.carLab = {
  show: (builds: CarBuild[]) => show(builds.map(validateCarBuild)),
  view: (name: string) => { view = name; },
  spin: (on: boolean) => { spin = on; },
  measureHachiroku,
  stock: stockBuild, rival: rivalCar,
};
