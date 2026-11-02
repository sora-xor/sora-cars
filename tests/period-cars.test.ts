import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BODY_IDS, BONNETS, EXHAUSTS, FENDERS, FRONT_AERO, LAMPS, MIRRORS, NEONS, ROOFS, SPOILERS, STANCES, STRIPES, TINTS, WHEEL_STYLES, rivalCar, stockBuild,
  validateCarBuild, type CarBuild,
} from '../src/game/car-builds';
import { CAR_PARTS } from '../src/game/drive/damage';
import { BODY_SPECS, type ProceduralBody } from '../src/game/three/period-cars/bodies';
import { HACHIROKU_FRAME } from '../src/game/three/period-cars/hachiroku';
import { kitPieces, wheelGeometry } from '../src/game/three/period-cars/kit';
import { carMaterials, createPeriodCar, stripeFrame, tailGlow } from '../src/game/three/period-cars/model';
import { stripeUniforms } from '../src/game/three/period-cars/paint';
import { NO_PART, PART, PART_COUNT, bodyTemplate } from '../src/game/three/period-cars/shell';

const PROCEDURAL = BODY_IDS.filter((id): id is ProceduralBody => id !== 'hachiroku');
const decals = { flag: new THREE.Texture(), emblem: new THREE.Texture(), strip: new THREE.Texture(), plate: new THREE.Texture(), number: () => new THREE.Texture() };
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
    { skirts: true }, { louvers: true }, { stance: 'rally' }, ...BONNETS.filter(bonnet => bonnet === 'scoop' || bonnet === 'vents').map(bonnet => ({ bonnet })),
    ...ROOFS.slice(1).map(roof => ({ roof })), { neon: 'pink' },
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

/** SORA's emblems in plan view (model.ts bodyDecals; asset-car.ts for the licensed hachiroku): roof and bonnet. */
function emblemCircles(body: ProceduralBody | 'hachiroku'): { z: number; r: number }[] {
  if (body === 'hachiroku') return [{ z: -0.4, r: 0.42 }, { z: 1.3, r: 0.25 }];
  const spec = BODY_SPECS[body], frame = bodyTemplate(body).frame, roofZ = (frame.roofFront + frame.roofRear) / 2;
  const roofSize = Math.min(0.8, (frame.roofFront - frame.roofRear) * 0.9, frame.cabin(roofZ)!.topHalf * 1.5);
  return [{ z: roofZ, r: roofSize / 2 }, { z: spec.panels.hood[0] + (spec.panels.hood[1] - spec.panels.hood[0]) * 0.55, r: 0.23 }];
}

test('bonnet scoops and vents, roof racks and ski carriers keep clear of SORA’s emblems on every body', () => {
  const frames = [...PROCEDURAL.map(body => [body, bodyTemplate(body).frame] as const), ['hachiroku', HACHIROKU_FRAME] as const];
  for (const [body, frame] of frames) {
    const circles = emblemCircles(body);
    for (const option of [{ bonnet: 'scoop' }, { bonnet: 'vents' }, { roof: 'rack' }, { roof: 'skis' }] as const) {
      // The option's own parts: kit geometry is shared, so the stock car's are the same objects.
      const stock = new Set(kitPieces(body, frame, stockBuild(0, body)).map(piece => piece.geometry));
      const fitted = kitPieces(body, frame, validateCarBuild({ ...stockBuild(0, body), ...option })).filter(piece => !stock.has(piece.geometry));
      assert.ok(fitted.length, `${body} ${JSON.stringify(option)}`);
      for (const piece of fitted) {
        // Each triangle's footprint, seen from above, stays outside both emblems' circles.
        const position = piece.geometry.getAttribute('position'), index = piece.geometry.index!;
        for (let t = 0; t < index.count; t += 3) {
          const xs = [0, 1, 2].map(i => position.getX(index.getX(t + i))), zs = [0, 1, 2].map(i => position.getZ(index.getX(t + i)));
          for (const { z, r } of circles) {
            const nx = Math.max(Math.min(...xs), Math.min(0, Math.max(...xs))), nz = Math.max(Math.min(...zs), Math.min(z, Math.max(...zs)));
            assert.ok(Math.hypot(nx, nz - z) >= r - 0.002, `${body} ${JSON.stringify(option)} ${piece.material} covers the emblem at z ${z.toFixed(2)}`);
          }
        }
      }
    }
  }
});

test('each new part goes with its panel: bonnet parts with the bonnet, lamps with the bumper; roof loads and neon stay on the car', () => {
  const frames = [...PROCEDURAL.map(body => [body, bodyTemplate(body).frame] as const), ['hachiroku', HACHIROKU_FRAME] as const];
  for (const [body, frame] of frames) {
    const stock = new Set(kitPieces(body, frame, stockBuild(0, body)).map(piece => piece.geometry));
    const fitted = (option: Partial<CarBuild>) => kitPieces(body, frame, validateCarBuild({ ...stockBuild(0, body), ...option })).filter(piece => !stock.has(piece.geometry));
    for (const [option, part] of [[{ bonnet: 'scoop' }, PART.hood], [{ bonnet: 'vents' }, PART.hood], [{ lamps: 'fog' }, PART.frontBumper], [{ lamps: 'rally' }, PART.frontBumper],
      [{ roof: 'rack' }, NO_PART], [{ roof: 'skis' }, NO_PART], [{ neon: 'cyan' }, NO_PART]] as const) {
      const pieces = fitted(option);
      assert.ok(pieces.length && pieces.every(piece => piece.part === part), `${body} ${JSON.stringify(option)}: ${pieces.map(piece => piece.part)}`);
    }
  }
  for (const body of PROCEDURAL) {
    const model = car(body, { bonnet: 'scoop', lamps: 'rally', roof: 'skis', neon: 'cyan', number: 27, banner: true, tint: 'dark' }), all = meshes(model.group);
    const named = (name: string) => all.filter(mesh => mesh.name === name), kit = named('Kit paint').filter(mesh => mesh.userData.part === PART.hood);
    assert.ok(kit.length, `${body} scoop`);
    const skis = all.filter(mesh => materialName(mesh) === 'Ski'), neon = all.filter(mesh => materialName(mesh) === 'Neon'), pool = model.group.getObjectByName('Neon underglow')!;
    const bonnetEmblem = named('SORA emblem decal').filter(mesh => mesh.userData.part === PART.hood), roofEmblem = named('SORA emblem decal').filter(mesh => mesh.userData.part === NO_PART);
    // Every panel gone: what was on a panel goes with it, and the rest stays on the car.
    model.setDamage!(2 ** PART_COUNT - 1);
    for (const mesh of [...kit, ...bonnetEmblem, ...named('SORA flag decal')]) assert.equal(mesh.visible, false, `${body} ${mesh.name} goes with its panel`);
    for (const mesh of [...skis, ...neon, pool, ...roofEmblem, ...named('SORA banner decal')]) assert.equal(mesh.visible, true, `${body} ${mesh.name} stays`);
    for (const mesh of named('SORA number decal')) assert.equal(mesh.visible, mesh.userData.part === NO_PART, `${body} a number goes only with a panel it sits on`);
    model.setDamage!(0);
    assert.ok(all.every(mesh => mesh.visible || mesh.parent?.name === 'Boost exhaust'), `${body} whole again`);
    // A thrown bonnet carries its scoop; a thrown bumper its rally lamps.
    const plain = car(body);
    for (const bit of [PART.hood, PART.frontBumper]) assert.ok(meshes(model.breakPart!(bit)!.object).length > meshes(plain.breakPart!(bit)!.object).length, `${body} panel ${bit} throws its bolted parts`);
    plain.dispose!(); model.dispose!();
  }
});

test('lamps at work: a braking car’s tails brighten, smoked or not; yellow bulbs light the rally lamps too', () => {
  for (const body of PROCEDURAL) for (const tails of ['stock', 'smoked'] as const) {
    const model = car(body, { tails }), tail = meshes(model.group).map(mesh => mesh.material as THREE.MeshStandardMaterial).find(material => material.name === 'LampCovers' && material.emissive.getHex() === 0xff2a2a)!;
    model.animate(20, 0, false, false, 1);
    const cruising = tail.emissiveIntensity;
    model.animate(20, 0, true, false, 1.1);
    assert.ok(tail.emissiveIntensity > cruising * 1.5, `${body} ${tails} brake lamps`);
    model.dispose!();
  }
  const head = (headlights: 'white' | 'yellow') => meshes(car('hibari', { lamps: 'rally', headlights }).group).filter(mesh => mesh.name === 'Kit head').map(mesh => (mesh.material as THREE.MeshStandardMaterial).emissive.b);
  assert.ok(head('yellow').length && head('yellow').every((blue, i) => blue < head('white')[i]! * 0.6), 'rally lenses take the bulbs');
});

test('lights and glass: yellow bulbs, smoked tails and window film change only their lenses and glass', () => {
  const stock = carMaterials(stockBuild(0, 'kakeru'));
  const yellow = carMaterials(validateCarBuild({ ...stockBuild(0, 'kakeru'), headlights: 'yellow' }));
  assert.ok(yellow.head.emissive.b < stock.head.emissive.b * 0.6 && yellow.head.emissive.r >= 0.99, 'yellow bulbs');
  const smoked = carMaterials(validateCarBuild({ ...stockBuild(0, 'kakeru'), tails: 'smoked' }));
  assert.ok(smoked.tail.color.getHSL({ h: 0, s: 0, l: 0 }).l < stock.tail.color.getHSL({ h: 0, s: 0, l: 0 }).l * 0.6, 'smoked lenses');
  assert.ok(tailGlow(validateCarBuild({ ...stockBuild(), tails: 'smoked' }))[0] < tailGlow(stockBuild())[0] && tailGlow()[1] > tailGlow()[0], 'they still brake brighter');
  const opacity = TINTS.map(tint => carMaterials(validateCarBuild({ ...stockBuild(0, 'raimei'), tint })).glass);
  assert.ok(opacity[1]!.opacity > opacity[0]!.opacity && opacity[2]!.opacity > opacity[1]!.opacity, 'light then dark smoke');
  assert.ok(opacity[3]!.metalness > 0.5, 'gold mirror film reflects');
  assert.ok(opacity.every(glass => glass.name === 'Windows'), 'the pixel-art stages still find the glass');
});

test('a black bonnet is painted on the bonnet’s top only, under the stripes', () => {
  for (const body of PROCEDURAL) {
    const frame = bodyTemplate(body).frame, paint = stripeFrame(frame), [z0, z1, half, low] = paint.bonnet, spec = BODY_SPECS[body];
    const hoodZ = spec.panels.hood[0] + (spec.panels.hood[1] - spec.panels.hood[0]) * 0.55;
    assert.ok(hoodZ > z0 && hoodZ < z1 && frame.top(hoodZ, 0) > low && half > 0.4 && half < frame.half(hoodZ), `${body} covers the bonnet`);
    assert.ok(spec.bumpers.front[1] < low && z0 > frame.cowl - 0.1, `${body} leaves the bumper and windscreen`);
    assert.equal(stripeUniforms(validateCarBuild({ ...stockBuild(0, body), bonnet: 'black' }), '#fff', paint).soraBonnetOn.value, 1);
    assert.equal(stripeUniforms(validateCarBuild({ ...stockBuild(0, body), bonnet: 'black' }), '#fff', paint, false).soraBonnetOn.value, 0);
    assert.equal(stripeUniforms(validateCarBuild({ ...stockBuild(0, body), bonnet: 'scoop' }), '#fff', paint).soraBonnetOn.value, 0);
  }
});

test('racing numbers sit between the door and the rear wheel on both sides; the banner tops the windscreen', () => {
  for (const body of PROCEDURAL) {
    const spec = BODY_SPECS[body], group = car(body, { number: 27, banner: true }).group, all = meshes(group);
    const centre = (mesh: THREE.Mesh) => new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
    const numbers = all.filter(mesh => mesh.name === 'SORA number decal'), flags = all.filter(mesh => mesh.name === 'SORA flag decal');
    assert.ok(numbers.some(mesh => centre(mesh).x > 0.5) && numbers.some(mesh => centre(mesh).x < -0.5), `${body} numbers on both sides`);
    const [d0] = spec.panels.doors[0]!, archFront = spec.wheels.rear + spec.wheels.arch;
    for (const number of numbers) {
      const box = new THREE.Box3().setFromBufferAttribute(number.geometry.getAttribute('position') as THREE.BufferAttribute);
      assert.ok(box.min.z > archFront - 0.01 && box.max.z < spec.panels.doors[0]![1], `${body} number ${box.min.z.toFixed(2)} .. ${box.max.z.toFixed(2)} clear of the rear wheel`);
      for (const flag of flags) assert.ok(!box.intersectsBox(new THREE.Box3().setFromBufferAttribute(flag.geometry.getAttribute('position') as THREE.BufferAttribute)), `${body} number clear of the flag`);
      if (spec.vent) assert.ok(box.min.z > spec.vent.z[1], `${body} number clear of the intakes`);
      else assert.ok(box.max.z < d0 + 0.01, `${body} number behind the door`);
    }
    const banner = all.filter(mesh => mesh.name === 'SORA banner decal');
    assert.ok(banner.length, `${body} windscreen banner`);
    for (const mesh of banner) { const at = centre(mesh); assert.ok(at.z > spec.cabin.roofFront && at.z < spec.cabin.cowl && Math.abs(at.x) < 0.05, `${body} banner centred on the windscreen`); }
    const plain = meshes(car(body).group);
    assert.ok(!plain.some(mesh => mesh.name === 'SORA number decal' || mesh.name === 'SORA banner decal'), `${body} has neither by default`);
  }
});

test('underglow: neon tubes under the sills and a pool of light on the road, brighter after dark', () => {
  for (const neon of NEONS.slice(1)) {
    const glows: THREE.Material[] = [];
    const model = createPeriodCar('hibari', validateCarBuild({ ...stockBuild(0, 'hibari'), neon, stance: 'low' }), decals,
      { dissolve: () => {}, night: (_paint, _emblems, glow = []) => { glows.push(...glow); return () => {}; } });
    const pool = model.group.getObjectByName('Neon underglow') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    assert.ok(pool && pool.parent === model.group, `${neon}: the pool stays on the road whatever the stance`);
    assert.ok(pool.material.transparent && pool.material.blending === THREE.AdditiveBlending && !pool.material.depthWrite, `${neon} glows additively`);
    assert.deepEqual(glows, [pool.material], `${neon} takes the night's level`);
    const box = new THREE.Box3().setFromObject(pool);
    assert.ok(box.max.y < 0.05 && box.max.x > BODY_SPECS.hibari.half.at(-1)![1], `${neon} pool reaches past the sides`);
    assert.ok(meshes(model.group).some(mesh => materialName(mesh) === 'Neon'), `${neon} tubes`);
    model.dispose!();
  }
  assert.equal(car('hibari').group.getObjectByName('Neon underglow'), undefined);
});

test('body-coloured aero is painted with the body; black aero stays black plastic', () => {
  const kit = (aeroColour: 'black' | 'body') => meshes(car('mikazuki', { front: 'lip', skirts: true, aeroColour }).group).filter(mesh => mesh.name === 'Kit aero');
  assert.ok(kit('black').length && kit('black').every(mesh => materialName(mesh) === 'Trim2'));
  assert.ok(kit('body').length && kit('body').every(mesh => materialName(mesh) === 'Primary'));
});
