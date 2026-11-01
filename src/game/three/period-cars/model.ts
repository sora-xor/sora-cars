import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { buildColours, resolvedBuild, type CarBuild } from '../../car-builds';
import type { CarModel } from '../car';
import { BODY_SPECS, type ProceduralBody } from './bodies';
import { HACHIROKU_FRAME } from './hachiroku';
import { flareTrack, kitPieces, wheelGeometry, type KitPiece } from './kit';
import { applyFinish, stripeShader, stripeUniforms, type StripeFrame } from './paint';
import { NO_PART, PART_COUNT, bodyTemplate, type BodyFrame, type PieceMaterial } from './shell';

/**
 * A period car built to order: a procedural body (shell.ts) with the build's paint, stripes, wheels, kit and stance,
 * the exact SORA flag on its doors and the emblem on its roof and bonnet, and a seated driver. It answers the race
 * exactly as the detailed hachiroku does (car.ts CarModel): paint, fade, wheels, lamps, boost and breakaway panels.
 */
export interface CarDecals {
  readonly flag: THREE.Texture; readonly emblem?: THREE.Texture; readonly strip?: THREE.Texture; readonly plate?: THREE.Texture;
}
/** How a car's materials take the race's screen-door fade and lamp cap (asset-car.ts addDissolve). */
export type Dissolve = (material: THREE.Material, opacity: { value: number }, extra?: { compile: (shader: THREE.WebGLProgramParametersWithUniforms) => void; key: string }) => void;
export interface PeriodCarHooks {
  readonly dissolve: Dissolve;
  /** Registers paint and emblems for the night's street light; returns the release. */
  readonly night: (paint: THREE.MeshStandardMaterial[], emblems: THREE.MeshStandardMaterial[]) => () => void;
}

/** Stance: body drop (m), wheel camber (rad). */
export const STANCE = { stock: { drop: 0, camber: 0 }, low: { drop: -0.045, camber: 0.03 }, oni: { drop: -0.05, camber: 0.2 }, rally: { drop: 0.045, camber: 0 } } as const;

export function stripeFrame(frame: BodyFrame): StripeFrame {
  const rear = frame.tail + 0.2, front = frame.nose - 0.2;
  return { belt: [rear, frame.belt(rear), front, frame.belt(front)], sill: frame.sill, lowerLine: frame.lowerLine, front: frame.front, rear: frame.rear };
}

/** One car's materials, named as the detailed model's are so the pixel-art car stages read plates, lamps and glass. */
export function carMaterials(build: CarBuild): Record<PieceMaterial, THREE.MeshStandardMaterial> {
  const colours = buildColours(build);
  const physical = (name: string, color: string) => { const m = new THREE.MeshPhysicalMaterial({ name, color }); m.envMapIntensity = 1; return m; };
  const paint = physical('Primary', colours.paint); applyFinish(paint, colours.finish);
  const lower = physical('Secondary', colours.lower ?? colours.paint); applyFinish(lower, colours.lower ? 'solid' : colours.finish);
  if (colours.lower) { lower.roughness = 0.34; lower.clearcoat = 0.7; lower.clearcoatRoughness = 0.2; }
  const aero = physical('Trim2', '#22252b'); aero.roughness = 0.42; aero.clearcoat = 0.4;
  const standard = (name: string, parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ name, ...parameters });
  const lens = (name: string, color: string, emissive: string, intensity: number) => {
    const m = new THREE.MeshPhysicalMaterial({ name, color, emissive, emissiveIntensity: intensity, roughness: 0.13, clearcoat: 0.7, clearcoatRoughness: 0.13 });
    m.transparent = true; m.opacity = 0.9; m.depthWrite = false; return m;
  };
  const glass = new THREE.MeshPhysicalMaterial({ name: 'Windows', color: '#33444f', roughness: 0.075, metalness: 0, transparent: true, opacity: 0.36, depthWrite: false });
  const rim = standard('RimMaterial', { color: colours.wheel, metalness: build.wheelColour === 'white' ? 0.2 : 0.75, roughness: build.wheelColour === 'white' ? 0.4 : 0.3 });
  return {
    paint, lower, aero,
    under: standard('Shadow', { color: '#121317', roughness: 0.92, side: THREE.DoubleSide }),
    trim: standard('Trim1', { color: '#1b1d22', roughness: 0.55, metalness: 0.1 }),
    chrome: standard('Reflector', { color: '#c9ccd0', metalness: 0.9, roughness: 0.16 }),
    glass,
    head: lens('LampCovers', '#f6eee0', '#ffedd4', 1.8),
    tail: lens('LampCovers', '#c0202c', '#ff2a2a', 1.8),
    tailFrame: standard('TailightFrame', { color: '#141418', roughness: 0.45, metalness: 0.2 }),
    amber: lens('Indicator', '#e08a26', '#ff9a30', 0.25),
    reverse: lens('Reverse', '#e8e8e4', '#ffffff', 0.05),
    plate: standard('LicensePlate', { color: '#fff5d9', roughness: 0.6 }),
    interior: standard('Interior', { color: '#1d1c22', roughness: 0.95, side: THREE.DoubleSide }),
    seat: standard('Interior', { color: '#2a2832', roughness: 0.98 }),
    tyre: standard('TireMaterial', { color: '#18191d', roughness: 0.93 }),
    rim,
    disc: standard('Brake_Disc', { color: '#56585c', metalness: 0.7, roughness: 0.42 }),
    caliper: standard('BrakeCaliper', { color: '#a8262a', roughness: 0.4, metalness: 0.2 }),
  };
}

/** A procedural period car, ready to race. `driver` is a seated driver posed for the hachiroku's cabin. */
export function createPeriodCar(body: ProceduralBody, build: CarBuild, decals: CarDecals, hooks: PeriodCarHooks, driver?: THREE.Object3D, driverSeat?: THREE.Vector3): CarModel {
  const spec = BODY_SPECS[body], template = bodyTemplate(body), frame = template.frame, resolved = resolvedBuild(build);
  const colours = buildColours(build), materials = carMaterials(build), opacity = { value: 1 };
  const stripes = stripeUniforms(build, colours.stripe, stripeFrame(frame));
  hooks.dissolve(materials.paint, opacity, stripeShader(stripes));
  for (const [key, material] of Object.entries(materials)) {
    if (key !== 'paint') hooks.dissolve(material, opacity);
    if (key === 'plate' && decals.plate) material.map = decals.plate;
  }
  const group = new THREE.Group(); group.name = `SORA ${body} ${build.paint}`;
  group.userData.asset = `SORA ${body}`; group.userData.build = build;
  const bodyGroup = new THREE.Group(); bodyGroup.name = 'Body'; group.add(bodyGroup);
  const stance = STANCE[build.stance];
  bodyGroup.position.y = stance.drop;
  const parted: THREE.Mesh[] = [], shadowMeshes: THREE.Mesh[] = [];
  const addPiece = (parent: THREE.Object3D, material: PieceMaterial, part: number, geometry: THREE.BufferGeometry, name: string) => {
    const mesh = new THREE.Mesh(geometry, materials[material]); mesh.name = name;
    mesh.castShadow = !['glass', 'head', 'tail', 'amber', 'reverse', 'interior'].includes(material); mesh.receiveShadow = true;
    if (material === 'glass') mesh.renderOrder = 1;
    mesh.userData.part = part;
    if (part !== NO_PART) parted.push(mesh);
    if (mesh.castShadow) shadowMeshes.push(mesh);
    parent.add(mesh);
    return mesh;
  };
  for (const piece of template.pieces) addPiece(bodyGroup, piece.material, piece.part, piece.geometry, `${body} ${piece.material}`);
  const kit: KitPiece[] = kitPieces(body, frame, build);
  for (const piece of kit) addPiece(bodyGroup, piece.material, piece.part, piece.geometry, `Kit ${piece.material}`);

  // The supplied flag on both doors, SORA's emblem centred on the roof and the bonnet, the club strip on the backlight.
  const decalMaterial = (map: THREE.Texture, emissive = false) => {
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: emissive ? 0.5 : 0.03, roughness: 0.42, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...(emissive ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0 } : {}) });
    hooks.dissolve(material, opacity); return material;
  };
  const flagMaterial = decalMaterial(decals.flag), emblemMaterial = decals.emblem ? decalMaterial(decals.emblem, true) : null;
  const stripMaterial = decals.strip ? decalMaterial(decals.strip) : null;
  for (const { mesh, material, part } of bodyDecals(template, frame, !!decals.emblem, !!decals.strip)) {
    const target = material === 'flag' ? flagMaterial : material === 'emblem' ? emblemMaterial : stripMaterial;
    if (!target) { mesh.geometry.dispose(); continue; }
    mesh.material = target; mesh.userData.part = part; if (part !== NO_PART) parted.push(mesh);
    bodyGroup.add(mesh);
  }
  const release = hooks.night([materials.paint, materials.lower], emblemMaterial ? [emblemMaterial] : []);

  if (driver) {
    // The driver is seated for the hachiroku's cabin: move them to this body's seat.
    const seat = new THREE.Vector3(...spec.seat), from = driverSeat ?? new THREE.Vector3(...HACHIROKU_FRAME.seat);
    driver.position.add(seat.sub(from)); bodyGroup.add(driver);
    driver.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material) ? object.material.map(m => { const c = m.clone(); hooks.dissolve(c, opacity); return c; }) : (() => { const c = object.material.clone(); hooks.dissolve(c, opacity); return c; })();
    });
  }

  // Wheels: each steers on its own group, turns about its axle, and leans with the stance's camber.
  const w = spec.wheels, track = w.track + flareTrack(build, spec.blisters), wheels = wheelGeometry(resolved.wheels as Exclude<typeof resolved.wheels, 'stock'>, w.radius, w.width);
  const wheelGroups = [[1, w.front], [-1, w.front], [1, w.rear], [-1, w.rear]].map(([side, z], index) => {
    const steering = new THREE.Group(), orientation = new THREE.Group(), spin = new THREE.Group();
    steering.name = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'][index]!;
    steering.position.set(side! * track, w.radius, z!); steering.rotation.z = -side! * stance.camber;
    orientation.rotation.y = side! > 0 ? 0 : Math.PI;
    steering.add(orientation); orientation.add(spin); group.add(steering);
    for (const piece of wheels.spin) addPiece(spin, piece.material, NO_PART, piece.geometry, `Wheel ${piece.material}`);
    for (const piece of wheels.fixed) addPiece(orientation, piece.material, NO_PART, piece.geometry, `Brake ${piece.material}`);
    return { steering, spin, front: index < 2 };
  });
  group.userData.tyreContacts = wheelGroups.map(wheel => [wheel.steering.position.x, 0, wheel.steering.position.z]);
  group.userData.rearTyreContacts = group.userData.tyreContacts.slice(2);

  // Boost: flames from the tailpipes (the takeyari's tips stand high).
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#72d0ff', transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  hooks.dissolve(flameMaterial, opacity);
  const exhaust = new THREE.Group(); exhaust.name = 'Boost exhaust'; exhaust.visible = false;
  const flameGeometry = new THREE.ConeGeometry(0.064, 0.38, 12, 1, true); flameGeometry.rotateX(-Math.PI / 2); flameGeometry.translate(0, 0, -0.19);
  const tailpipes: [number, number, number, number][] = resolved.exhaust === 'takeyari'
    ? [[-0.5 - 0.154, Math.max(0.17, spec.bumpers.rear[0] - 0.02) + 1.15, spec.rear - 0.85, -0.9], [-0.5 + 0.154, Math.max(0.17, spec.bumpers.rear[0] - 0.02) + 1.15, spec.rear - 0.85, -0.9]]
    : [[-0.5, Math.max(0.17, spec.bumpers.rear[0] - 0.02), spec.rear - 0.05, 0]];
  for (const [x, y, z, pitch] of tailpipes) { const flame = new THREE.Mesh(flameGeometry, flameMaterial); flame.position.set(x, y, z); flame.rotation.x = pitch; exhaust.add(flame); }
  bodyGroup.add(exhaust);

  let lastTime: number | null = null, angle = 0, lastColor = '', lastDetached = -1;
  const thrown = new Map<number, THREE.BufferGeometry[]>();
  const car: CarModel = {
    group,
    setDamage(detached) {
      if (detached === lastDetached) return;
      lastDetached = detached;
      for (const mesh of parted) mesh.visible = !(Math.floor(detached / 2 ** mesh.userData.part) % 2 === 1);
    },
    breakPart(bit) {
      if (bit < 0 || bit >= PART_COUNT) return null;
      // The panel's own pieces, and the build's parts bolted to it (a lip on the bumper, a wing on the boot, mirrors).
      const part = template.breakage[bit]!, bolted = kit.filter(piece => piece.part === bit);
      if (!part.pieces.length && !bolted.length) return null;
      const bounds = new THREE.Box3();
      for (const piece of bolted) { piece.geometry.computeBoundingBox(); bounds.union(piece.geometry.boundingBox!); }
      const centre = part.pieces.length ? new THREE.Vector3(...part.centre) : bounds.getCenter(new THREE.Vector3());
      const object = new THREE.Group(); object.name = `Broken-off panel ${bit}`;
      const add = (geometry: THREE.BufferGeometry, material: PieceMaterial) => {
        const mesh = new THREE.Mesh(geometry, materials[material]); mesh.castShadow = true; mesh.receiveShadow = true; object.add(mesh);
      };
      for (const { material, geometry } of part.pieces) add(geometry, material);
      // Centred copies of the bolted parts, made once per car (a panel breaks once a race) and released with it.
      let copies = thrown.get(bit);
      if (!copies) thrown.set(bit, copies = bolted.map(piece => piece.geometry.clone().translate(-centre.x, -centre.y, -centre.z)));
      bolted.forEach((piece, i) => add(copies![i]!, piece.material));
      object.position.set(centre.x, centre.y + stance.drop, centre.z);
      return { object, size: part.pieces.length ? part.size : Math.max(0.15, bounds.getSize(new THREE.Vector3()).length() / 2) };
    },
    setAppearance(color) {
      if (color !== lastColor) { materials.paint.color.set(color); if (!colours.lower) materials.lower.color.set(color); lastColor = color; }
    },
    setOpacity(value) {
      const next = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 1;
      if (opacity.value === next) return;
      opacity.value = next;
      for (const mesh of shadowMeshes) mesh.castShadow = next === 1;
    },
    animate(speedMetersPerSecond, steerRadians, braking, boosting, time) {
      const speed = Number.isFinite(speedMetersPerSecond) ? speedMetersPerSecond : 0, now = Number.isFinite(time) ? time : 0;
      if (lastTime !== null && now < lastTime) angle = 0;
      const elapsed = lastTime === null ? 0 : THREE.MathUtils.clamp(now - lastTime, 0, 0.1); lastTime = now;
      angle = (angle + speed * elapsed / w.radius) % (Math.PI * 2000);
      const steering = Number.isFinite(steerRadians) ? THREE.MathUtils.clamp(steerRadians, -0.52, 0.52) : 0;
      for (const wheel of wheelGroups) { wheel.steering.rotation.y = wheel.front ? steering : 0; wheel.spin.rotation.x = angle; }
      materials.tail.emissiveIntensity = braking ? 3.2 : 1.8;
      exhaust.visible = boosting; exhaust.scale.z = boosting ? 0.9 + Math.sin(now * 37) * 0.14 : 1;
    },
    dispose() {
      release();
      for (const material of [...Object.values(materials), flagMaterial, emblemMaterial, stripMaterial, flameMaterial]) material?.dispose();
      flameGeometry.dispose();
      for (const copies of thrown.values()) for (const geometry of copies) geometry.dispose();
    },
  };
  car.setAppearance(colours.paint);
  return car;
}

const decalCache = new Map<string, { geometry: THREE.BufferGeometry; material: 'flag' | 'emblem' | 'strip'; part: number }[]>();
/** The body's flag, emblem and strip decals, projected once per body onto its own panels. */
function bodyDecals(template: ReturnType<typeof bodyTemplate>, frame: BodyFrame, emblem: boolean, strip: boolean): { mesh: THREE.Mesh; material: 'flag' | 'emblem' | 'strip'; part: number }[] {
  let entries = decalCache.get(template.id);
  if (!entries) {
    entries = [];
    const pieces = (material: PieceMaterial, part: number) => template.pieces.filter(piece => piece.material === material && piece.part === part);
    const project = (targets: readonly { geometry: THREE.BufferGeometry }[], at: THREE.Vector3, rotation: THREE.Euler, size: THREE.Vector3) => {
      const out: THREE.BufferGeometry[] = [];
      for (const target of targets) {
        const mesh = new THREE.Mesh(target.geometry); mesh.updateMatrixWorld(true);
        const decal = new DecalGeometry(mesh, at, rotation, size);
        if (decal.getAttribute('position').count) out.push(decal); else decal.dispose();
      }
      return out;
    };
    const spec = BODY_SPECS[template.id];
    // Doors: the flag centred on the (front) door, as on the hachiroku.
    const [d0, d1] = spec.panels.doors[0]!, doorZ = (d0 + d1) / 2, doorY = (frame.sill + frame.lowerLine + frame.belt(doorZ)) / 2 + 0.05;
    for (const [side, part] of [[1, 10], [-1, 11]] as const) {
      for (const geometry of project(pieces('paint', part), new THREE.Vector3(side * frame.half(doorZ), doorY, doorZ), new THREE.Euler(0, side * Math.PI / 2, 0), new THREE.Vector3(0.34, 0.21, 0.2))) {
        entries.push({ geometry, material: 'flag', part });
      }
    }
    const upright = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
    const roofZ = (frame.roofFront + frame.roofRear) / 2, roof = frame.cabin(roofZ)!, roofSize = Math.min(0.8, (frame.roofFront - frame.roofRear) * 0.9, roof.topHalf * 1.5);
    for (const geometry of project(pieces('paint', NO_PART), new THREE.Vector3(0, roof.top + 0.03, roofZ), upright, new THREE.Vector3(roofSize, roofSize, 0.3))) entries.push({ geometry, material: 'emblem', part: NO_PART });
    const hoodZ = spec.panels.hood[0] + (spec.panels.hood[1] - spec.panels.hood[0]) * 0.55;
    for (const geometry of project(pieces('paint', 4), new THREE.Vector3(0, frame.top(hoodZ, 0), hoodZ), upright, new THREE.Vector3(0.46, 0.46, 0.3))) entries.push({ geometry, material: 'emblem', part: 4 });
    // The club strip across the top of the backlight, read upright from the chase camera.
    const stripZ = frame.roofRear - 0.06, a = frame.cabin(stripZ), b = frame.cabin(stripZ - 0.05);
    if (a && b) {
      const slope = new THREE.Vector3(0, a.top - b.top, 0.05).normalize(), across = new THREE.Vector3(-1, 0, 0);
      const facing = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, slope, across.clone().cross(slope)));
      const width = Math.min(1.0, a.topHalf * 1.6);
      for (const geometry of project(pieces('glass', NO_PART), new THREE.Vector3(0, a.top - 0.06, stripZ - 0.04), facing, new THREE.Vector3(width, 0.15, 0.2))) entries.push({ geometry, material: 'strip', part: NO_PART });
    }
    decalCache.set(template.id, entries);
  }
  return entries.filter(entry => entry.material === 'flag' || entry.material === 'emblem' && emblem || entry.material === 'strip' && strip)
    .map(entry => { const mesh = new THREE.Mesh(entry.geometry); mesh.name = `SORA ${entry.material} decal`; return { mesh, material: entry.material, part: entry.part }; });
}
