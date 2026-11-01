import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BODY_IDS, EXHAUSTS, FENDERS, FRONT_AERO, LAMPS, MIRRORS, SPOILERS, STANCES, STRIPES, WHEEL_STYLES, rivalCar, stockBuild, validateCarBuild, type CarBuild,
} from '../src/game/car-builds';
import { CAR_PARTS } from '../src/game/drive/damage';
import { BODY_SPECS, type ProceduralBody } from '../src/game/three/period-cars/bodies';
import { HACHIROKU_FRAME } from '../src/game/three/period-cars/hachiroku';
import { kitPieces, wheelGeometry } from '../src/game/three/period-cars/kit';
import { createPeriodCar } from '../src/game/three/period-cars/model';
import { PART, PART_COUNT, bodyTemplate } from '../src/game/three/period-cars/shell';

const PROCEDURAL = BODY_IDS.filter((id): id is ProceduralBody => id !== 'hachiroku');
const decals = { flag: new THREE.Texture(), emblem: new THREE.Texture(), strip: new THREE.Texture(), plate: new THREE.Texture() };
const hooks = { dissolve: () => {}, night: () => () => {} };
const meshes = (root: THREE.Object3D) => { const found: THREE.Mesh[] = []; root.traverse(o => { if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh); }); return found; };
const materialName = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material).name;
/** The car's visible extent (the boost flames are hidden until boost). */
const visibleBox = (root: THREE.Object3D) => {
  const box = new THREE.Box3(); root.updateMatrixWorld(true);
  root.traverseVisible(object => { if ((object as THREE.Mesh).isMesh) box.expandByObject(object); });
  return box;
};
const car = (body: ProceduralBody, build: Partial<CarBuild> = {}) => createPeriodCar(body, validateCarBuild({ ...stockBuild(0, body), ...build }), decals, hooks);

test('each period body is about the driving model’s car: 3.7 to 4.45 m long, tyres on the road', () => {
  assert.equal(CAR_PARTS.length, PART_COUNT);
  for (const body of PROCEDURAL) {
    const model = car(body), box = visibleBox(model.group), size = box.getSize(new THREE.Vector3()), spec = BODY_SPECS[body];
    assert.ok(size.z > 3.6 && size.z < 4.5, `${body} length ${size.z.toFixed(2)}`);
    assert.ok(Math.abs(box.max.z - spec.front) < 0.06 && Math.abs(box.min.z - spec.rear) < 0.06, `${body} bumpers at ${box.min.z.toFixed(2)} .. ${box.max.z.toFixed(2)}`);
    assert.ok(size.x > 1.55 && size.x < 2.0, `${body} width ${size.x.toFixed(2)} (mirrors included)`);
    assert.ok(box.max.y > 1.15 && box.max.y < 1.55, `${body} roof ${box.max.y.toFixed(2)}`);
    assert.ok(Math.abs(box.min.y) < 0.02, `${body} sits on its tyres (${box.min.y.toFixed(3)})`);
    const contacts = model.group.userData.tyreContacts as number[][];
    assert.equal(contacts.length, 4);
    assert.ok(contacts[0]![0]! > 0 && contacts[1]![0]! < 0 && contacts[0]![2]! > contacts[2]![2]!, `${body}: front left, front right, rear left, rear right`);
  }
});

test('each body carries glass, plates and tail lamps named as the detailed model’s, for the pixel-art car stages', () => {
  for (const body of PROCEDURAL) {
    const names = new Set(meshes(car(body).group).map(materialName));
    for (const name of ['Primary', 'Secondary', 'Windows', 'LicensePlate', 'TailightFrame', 'LampCovers', 'TireMaterial', 'RimMaterial']) assert.ok(names.has(name), `${body} has ${name}`);
  }
});

test('the exact SORA flag sits on both doors, the emblem on the roof and bonnet, the club strip on the backlight', () => {
  for (const body of PROCEDURAL) {
    const decalMeshes = meshes(car(body).group).filter(mesh => /SORA (flag|emblem|strip) decal/.test(mesh.name));
    const flags = decalMeshes.filter(mesh => mesh.name.includes('flag')), emblems = decalMeshes.filter(mesh => mesh.name.includes('emblem'));
    assert.deepEqual(flags.map(mesh => mesh.userData.part).sort(), [PART.doorLeft, PART.doorRight], `${body} door flags`);
    for (const flag of flags) {
      const box = new THREE.Box3().setFromBufferAttribute(flag.geometry.getAttribute('position') as THREE.BufferAttribute), centre = box.getCenter(new THREE.Vector3());
      const [d0, d1] = BODY_SPECS[body].panels.doors[0]!;
      assert.ok(centre.z > d0 && centre.z < d1 && Math.abs(centre.z - (d0 + d1) / 2) < 0.08, `${body} flag centred on its door`);
    }
    assert.ok(emblems.some(mesh => mesh.userData.part === PART.hood) && emblems.some(mesh => mesh.userData.part === -1), `${body} roof and bonnet emblems`);
    assert.ok(decalMeshes.some(mesh => mesh.name.includes('strip')), `${body} club strip`);
    for (const mesh of decalMeshes) assert.ok(mesh.geometry.getAttribute('position').count > 0);
  }
});

test('panels break away: every part hides when detached and is thrown down the road', () => {
  for (const body of PROCEDURAL) {
    const model = car(body, { front: 'lip', spoiler: 'wing' }), parts = meshes(model.group).filter(mesh => mesh.userData.part >= 0);
    for (let bit = 0; bit < PART_COUNT; bit++) {
      assert.ok(parts.some(mesh => mesh.userData.part === bit), `${body} has ${CAR_PARTS[bit]!.id}`);
      const piece = model.breakPart!(bit);
      assert.ok(piece && piece.size > 0.05 && meshes(piece.object).length, `${body} throws its ${CAR_PARTS[bit]!.id}`);
    }
    model.setDamage!(2 ** PART.hood + 2 ** PART.mirrorLeft + 2 ** PART.frontBumper);
    for (const mesh of parts) {
      const gone = [PART.hood, PART.mirrorLeft, PART.frontBumper].includes(mesh.userData.part);
      assert.equal(mesh.visible, !gone, `${body} part ${mesh.userData.part}`);
    }
    model.setDamage!(0);
    assert.ok(parts.every(mesh => mesh.visible));
    model.dispose!();
  }
});

test('the bonnet, boot and doors are the panels the damage model names, on the right sides', () => {
  for (const body of PROCEDURAL) {
    const template = bodyTemplate(body), centre = (bit: number) => template.breakage[bit]!.centre;
    assert.ok(centre(PART.hood)[2] > 0.5 && centre(PART.trunk)[2] < -0.5, `${body} bonnet ahead, boot behind`);
    assert.ok(centre(PART.doorLeft)[0] > 0.5 && centre(PART.doorRight)[0] < -0.5, `${body} left door at +X`);
    assert.ok(centre(PART.headLeft)[0] > 0 && centre(PART.headRight)[0] < 0, `${body} lamps`);
    assert.ok(centre(PART.frontBumper)[2] > 1.5 && centre(PART.rearBumper)[2] < -1.5, `${body} bumpers`);
  }
});

test('every kit part fits every body, the licensed hachiroku included', () => {
  const frames = [...PROCEDURAL.map(body => [body, bodyTemplate(body).frame] as const), ['hachiroku', HACHIROKU_FRAME] as const];
  const options: Partial<CarBuild>[] = [
    ...FRONT_AERO.slice(1).map(front => ({ front })), ...SPOILERS.slice(1).map(spoiler => ({ spoiler })), ...FENDERS.slice(1).map(fenders => ({ fenders })),
    ...LAMPS.slice(1).map(lamps => ({ lamps })), ...EXHAUSTS.map(exhaust => ({ exhaust })), ...MIRRORS.map(mirrors => ({ mirrors })),
    { skirts: true }, { louvers: true }, { stance: 'rally' },
  ];
  for (const [body, frame] of frames) {
    const bare = kitPieces(body, frame, validateCarBuild({ ...stockBuild(0, body === 'hachiroku' ? 'hachiroku' : body), mirrors: 'stock', exhaust: 'stock', spoiler: 'stock' }), { mirrors: true, exhaust: true }).length;
    for (const option of options) {
      const build = validateCarBuild({ ...stockBuild(0, body === 'hachiroku' ? 'hachiroku' : body), ...option });
      const pieces = kitPieces(body, frame, build, { mirrors: true, exhaust: true });
      const own = 'mirrors' in option || 'exhaust' in option ? kitPieces(body, frame, build) : pieces;
      assert.ok(own.length > (('mirrors' in option || 'exhaust' in option) ? 0 : bare) || 'spoiler' in option && option.spoiler === build.spoiler,
        `${body} fits ${JSON.stringify(option)}`);
      for (const piece of own) {
        const box = piece.geometry.boundingBox ?? (piece.geometry.computeBoundingBox(), piece.geometry.boundingBox!);
        assert.ok(box.min.y > -0.05 && box.max.y < 2.6 && Math.abs(box.min.x) < 1.2 && Math.abs(box.max.x) < 1.2 && box.min.z > -3.4 && box.max.z < 2.7,
          `${body} ${JSON.stringify(option)} stays on the car`);
      }
    }
  }
});

test('wheels: every style turns on its axle inside the tyre', () => {
  for (const style of WHEEL_STYLES.filter(style => style !== 'stock')) {
    const wheel = wheelGeometry(style, 0.3, 0.2);
    for (const piece of wheel.spin) {
      piece.geometry.computeBoundingSphere();
      assert.ok(piece.geometry.boundingSphere!.radius < 0.33, `${style} ${piece.material}`);
    }
    assert.ok(wheel.spin.some(piece => piece.material === 'tyre') && wheel.spin.some(piece => piece.material === 'rim'), style);
    assert.ok(wheelGeometry(style, 0.29, 0.185, true).spin.every(piece => piece.material !== 'tyre'), `${style} rim alone`);
  }
});

test('stance, stripes and finishes change the car, never its contacts', () => {
  for (const stance of STANCES) {
    const model = car('hokuto', { stance }), body = model.group.getObjectByName('Body')!;
    assert.ok(stance === 'low' || stance === 'oni' ? body.position.y < 0 : stance === 'rally' ? body.position.y > 0 : body.position.y === 0, stance);
  }
  const flared = car('hokuto', { fenders: 'flares' }).group.userData.tyreContacts as number[][];
  const plain = car('hokuto').group.userData.tyreContacts as number[][];
  assert.ok(flared[0]![0]! > plain[0]![0]!, 'flares widen the track');
  for (const stripe of STRIPES) car('raimei', { stripe });
  for (let seed = 0; seed < 40; seed++) {
    const build = rivalCar(seed, 1);
    if (build.body !== 'hachiroku') createPeriodCar(build.body, build, decals, hooks).dispose!();
  }
});
