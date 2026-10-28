import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGarageEngine } from './engine-assembly';

/** A complete open engine bay in the AE86's local coordinates; +Z is forward. */
export function createGarageEngineBay(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Garage / exposed period engine bay';
  const makeMaterial = (name: string, color: string, roughness: number, metalness: number) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    material.name = `Engine bay / ${name}`;
    return material;
  };
  const enamel = makeMaterial('aged ivory inner wings', '#afa48b', .68, .23);
  enamel.side = THREE.DoubleSide;
  const charcoal = makeMaterial('charcoal stamped recesses', '#303a3c', .82, .26);
  const steel = makeMaterial('oxidised brackets', '#515755', .69, .58);
  const bright = makeMaterial('plated edges and fasteners', '#b9b7a1', .39, .72);
  const rubber = makeMaterial('hoses and moulded cases', '#222c30', .92, .03);
  const plastic = makeMaterial('aged reservoir plastic', '#c5b99b', .79, .02);
  const red = makeMaterial('positive terminal and loom', '#824134', .74, .04);
  const brass = makeMaterial('brake fittings', '#aa9364', .53, .64);
  const paper = makeMaterial('faded service labels', '#c0b892', .94, .01);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const up = p(0, 1, 0), front = p(0, 0, 1);

  function add(geometry: THREE.BufferGeometry, material: THREE.Material, at = p(0, 0, 0), rotation?: THREE.Euler) {
    if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    geometry.translate(at.x, at.y, at.z);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    if (!flat.getAttribute('uv')) flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.getAttribute('position').count * 2), 2));
    let batch = batches.get(material);
    if (!batch) { batch = []; batches.set(material, batch); }
    batch.push(flat);
    if (geometry !== flat) geometry.dispose();
  }
  function box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, radius = .004) {
    add(new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 4, h / 4, d / 4)), material, p(x, y, z));
  }
  function cylinder(material: THREE.Material, radius: number, length: number, at: THREE.Vector3, axis = up, segments = 20, topRadius = radius) {
    const geometry = new THREE.CylinderGeometry(topRadius, radius, length, segments);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, axis.clone().normalize()));
    add(geometry, material, at);
  }
  function rod(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number, segments = 8) {
    cylinder(material, radius, a.distanceTo(b), a.clone().lerp(b, .5), b.clone().sub(a), segments);
  }
  function ring(material: THREE.Material, radius: number, tube: number, at: THREE.Vector3, axis = up, segments = 24) {
    const geometry = new THREE.TorusGeometry(radius, tube, 5, segments);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(front, axis.clone().normalize()));
    add(geometry, material, at);
  }
  function hose(material: THREE.Material, points: number[][], radius: number, segments = 24, radial = 8) {
    const curve = new THREE.CatmullRomCurve3(points.map(v => p(v[0]!, v[1]!, v[2]!)), false, 'centripetal');
    add(new THREE.TubeGeometry(curve, segments, radius, radial, false), material);
    return curve;
  }
  function bolt(at: THREE.Vector3, axis = up, radius = .005) {
    cylinder(steel, radius * 1.55, .002, at, axis, 14);
    cylinder(bright, radius, .007, at.clone().addScaledVector(axis, .004), axis, 6);
    cylinder(charcoal, radius * .3, .0006, at.clone().addScaledVector(axis, .0078), axis, 6);
  }
  function clamp(at: THREE.Vector3, axis: THREE.Vector3, radius: number) {
    ring(bright, radius + .001, .0026, at, axis);
    const screwSide = new THREE.Vector3().crossVectors(axis, up);
    if (screwSide.lengthSq() < .01) screwSide.set(1, 0, 0);
    screwSide.normalize();
    cylinder(bright, .0042, .014, at.clone().addScaledVector(screwSide, radius + .006), axis, 8);
  }

  // The cavity is an actual deep enclosure; its folded walls do not bridge
  // across the top of the engine. Narrow raised beads describe pressed steel.
  box(charcoal, 1.04, .020, .89, 0, .287, 1.265, .003);
  box(charcoal, 1.065, .404, .026, 0, .520, .823, .008);
  box(enamel, 1.125, .037, .056, 0, .738, .833, .007);
  for (const x of [-.40, -.20, 0, .20, .40]) {
    box(steel, .020, .274, .008, x, .484, .841, .003);
    bolt(p(x, .737, .864), front, .0045);
  }
  for (const side of [-1, 1]) {
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    const stations = [.86, .96, 1.10, 1.27, 1.44, 1.61, 1.73];
    for (let i = 0; i < stations.length; i++) {
      const z = stations[i]!, bulge = Math.sin(i / (stations.length - 1) * Math.PI);
      const profile = [[.59, .720], [.525, .720], [.450, .643 + bulge * .027], [.370, .365 + bulge * .026]];
      for (let j = 0; j < profile.length; j++) {
        vertices.push(side * profile[j]![0]!, profile[j]![1]!, z);
        uvs.push(j / 3, i / (stations.length - 1));
      }
    }
    for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < 3; j++) {
      const a = i * 4 + j, b = a + 1, c = a + 4, d = c + 1;
      if (side < 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
    const innerWing = new THREE.BufferGeometry();
    innerWing.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    innerWing.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    innerWing.setIndex(indices); innerWing.computeVertexNormals(); add(innerWing, enamel);
    hose(enamel, [[side * .578, .734, .86], [side * .575, .734, 1.11], [side * .572, .734, 1.45], [side * .55, .716, 1.73]], .006, 32, 8);
    hose(steel, [[side * .433, .646, .91], [side * .427, .662, 1.14], [side * .425, .654, 1.43], [side * .41, .595, 1.70]], .0048, 28, 7);
    for (const z of [.90, 1.03, 1.45, 1.66]) bolt(p(side * .56, .728, z), up, .0044);
    for (const z of [.94, 1.50, 1.65]) box(charcoal, .040, .008, .027, side * .493, .706, z, .006);

    // Pressed strut tower, black isolator, central stem and three captive studs.
    const sx = side * .481, sz = 1.176;
    cylinder(enamel, .124, .070, p(sx, .692, sz), up, 28, .081);
    ring(enamel, .111, .009, p(sx, .671, sz));
    cylinder(steel, .077, .010, p(sx, .733, sz));
    cylinder(rubber, .048, .019, p(sx, .744, sz));
    cylinder(bright, .023, .008, p(sx, .758, sz));
    bolt(p(sx, .765, sz), up, .011);
    for (let j = 0; j < 3; j++) {
      const angle = j * Math.PI * 2 / 3 + .3;
      bolt(p(sx + Math.cos(angle) * .061, .742, sz + Math.sin(angle) * .061), up, .006);
    }
    // Real chassis rails, engine-mount rubbers and cast support arms below.
    box(steel, .07, .066, .77, side * .323, .354, 1.285, .006);
    cylinder(rubber, .046, .045, p(side * .241, .438, 1.203), up, 18);
    box(steel, .141, .018, .083, side * .238, .408, 1.203, .004);
    rod(bright, p(side * .244, .465, 1.203), p(side * .128, .511, 1.184), .016, 10);
    for (const z of [1.175, 1.231]) bolt(p(side * .284, .421, z), up, .0054);
  }

  // Same detailed four-cylinder model as the workshop engine, mounted without
  // the removable bench feet. Its own materials retain the engine paint pass.
  const engine = createGarageEngine({ mounted: true });
  engine.name = 'Garage / installed twin-cam engine';
  engine.scale.setScalar(.80);
  engine.position.set(-.012, .303, 1.207);
  group.add(engine);

  // Front radiator stays below the headlamp decks. Individually modelled fins,
  // tanks, caps, fan and bolted brackets remain legible when looking into it.
  box(charcoal, .764, .248, .037, 0, .474, 1.767, .005);
  for (const x of [-.384, .384]) box(rubber, .050, .264, .064, x, .476, 1.767, .007);
  for (const y of [.352, .595]) box(steel, .824, .027, .075, 0, y, 1.767, .005);
  for (let i = 0; i < 45; i++) {
    const x = -.360 + i * .0164;
    box(steel, .0035, .216, .004, x, .474, 1.744, .001);
    if (i % 3 === 0) box(bright, .0018, .212, .002, x + .002, .474, 1.741, .0005);
  }
  for (const y of [.400, .449, .499, .549]) box(charcoal, .735, .004, .007, 0, y, 1.738, .001);
  cylinder(steel, .021, .015, p(-.222, .609, 1.767), up, 18);
  box(bright, .051, .008, .024, -.222, .619, 1.767, .004);
  for (const x of [-.348, .348]) {
    box(enamel, .075, .018, .12, x, .609, 1.750, .004);
    for (const z of [1.715, 1.782]) bolt(p(x, .619, z), up, .006);
  }
  ring(rubber, .121, .011, p(.022, .477, 1.702), front, 36);
  cylinder(steel, .029, .033, p(.022, .477, 1.69), front, 24);
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    const blade = new RoundedBoxGeometry(.087, .025, .007, 1, .002);
    blade.applyMatrix4(new THREE.Matrix4().makeRotationZ(angle + .32));
    add(blade, charcoal, p(.022 + Math.cos(angle) * .067, .477 + Math.sin(angle) * .067, 1.688));
  }
  for (const side of [-1, 1]) rod(steel, p(side * .10, .58, 1.709), p(side * .15, .65, 1.73), .005);

  // Upper and lower coolant hoses have separate screw clamps at both ends.
  hose(rubber, [[.009, .658, 1.430], [.085, .637, 1.522], [.193, .595, 1.597], [.261, .558, 1.733]], .025, 36, 12);
  clamp(p(.020, .655, 1.448), p(.40, -.20, .90).normalize(), .025);
  clamp(p(.254, .564, 1.716), p(.34, -.19, .92).normalize(), .025);
  hose(rubber, [[-.260, .386, 1.728], [-.239, .36, 1.59], [-.099, .378, 1.510], [-.056, .456, 1.450]], .022, 28, 10);
  clamp(p(-.261, .383, 1.712), front, .022);
  clamp(p(-.063, .445, 1.460), p(.40, .68, -.61).normalize(), .022);

  // A serviceable battery: moulded lid, six filler caps, terminals, a clamp
  // across the case and separate braided ground / insulated positive cable.
  box(steel, .231, .016, .234, -.441, .456, 1.530, .005);
  box(rubber, .203, .175, .206, -.441, .551, 1.530, .008);
  box(charcoal, .222, .019, .216, -.441, .646, 1.530, .005);
  for (let i = 0; i < 6; i++) cylinder(rubber, .010, .006, p(-.518 + i * .031, .659, 1.530), up, 14);
  for (const [x, material] of [[-.505, bright], [-.377, red]] as const) {
    cylinder(bright, .009, .014, p(x, .669, 1.590), up, 14);
    box(material, .033, .016, .035, x, .678, 1.590, .005);
    bolt(p(x, .688, 1.590), up, .0045);
  }
  box(steel, .236, .009, .019, -.441, .663, 1.466, .002);
  for (const x of [-.551, -.331]) {
    rod(bright, p(x, .463, 1.467), p(x, .676, 1.467), .0035, 7);
    bolt(p(x, .67, 1.467), up, .0045);
  }
  box(paper, .105, .0015, .044, -.442, .657, 1.576, .001);
  for (let i = 0; i < 5; i++) box(charcoal, .070 - i * .006, .002, .0024, -.443, .659, 1.565 + i * .006, .0005);
  hose(red, [[-.377, .686, 1.59], [-.335, .686, 1.61], [-.307, .565, 1.45], [-.180, .403, 1.431]], .008, 26, 9);
  hose(rubber, [[-.505, .680, 1.59], [-.562, .647, 1.593], [-.568, .552, 1.41], [-.526, .541, 1.376]], .008, 22, 8);
  bolt(p(-.526, .541, 1.376), up, .007);

  // The air cleaner and ribbed intake are discrete volumes, with a top seam,
  // spring clips and a flexible duct connected to the actual engine intake.
  box(rubber, .218, .152, .245, .449, .547, 1.509, .013);
  box(charcoal, .231, .026, .252, .449, .633, 1.509, .009);
  for (let i = 0; i < 8; i++) box(steel, .174, .005, .007, .449, .65, 1.425 + i * .023, .002);
  for (const x of [.341, .557]) for (const z of [1.436, 1.58]) box(bright, .008, .027, .025, x, .619, z, .002);
  const intake = hose(rubber, [[.197, .713, 1.427], [.275, .714, 1.459], [.310, .702, 1.531], [.360, .659, 1.545]], .037, 32, 14);
  for (let i = 1; i < 16; i++) ring(charcoal, .0375, .0031, intake.getPoint(i / 17), intake.getTangent(i / 17), 22);
  clamp(intake.getPoint(.035), intake.getTangent(.035), .037);
  clamp(intake.getPoint(.96), intake.getTangent(.96), .037);

  // Brake servo and tandem master cylinder sit against the firewall, clear of
  // the strut tower. Small formed lines end in hex unions instead of free space.
  cylinder(charcoal, .086, .041, p(-.387, .603, .865), front, 30);
  ring(steel, .083, .004, p(-.387, .603, .888), front, 28);
  cylinder(bright, .026, .130, p(-.387, .608, .953), front, 20);
  box(plastic, .068, .070, .095, -.387, .670, .948, .010);
  cylinder(rubber, .024, .012, p(-.387, .712, .944), up, 20);
  for (const z of [.917, .986]) {
    cylinder(brass, .008, .020, p(-.356, .606, z), p(1, 0, 0), 6);
    hose(brass, [[-.344, .607, z], [-.304, .573, z + .008], [-.314, .446, z + .010], [-.424, .422, z + .035]], .0027, 18, 7);
  }
  hose(rubber, [[-.454, .613, .889], [-.452, .671, .884], [-.277, .717, .900], [-.066, .699, 1.004]], .009, 26, 8);
  clamp(p(-.457, .619, .891), up, .009);

  // Expansion bottle, small fuse box, heater hoses and retained wiring looms.
  box(plastic, .073, .138, .118, .453, .633, .960, .015);
  cylinder(rubber, .018, .013, p(.453, .710, .951), up, 18);
  hose(rubber, [[.456, .687, .909], [.400, .672, .884], [.354, .560, 1.196], [.349, .525, 1.622], [.267, .563, 1.758]], .0036, 42, 7);
  box(rubber, .148, .064, .126, .202, .688, .888, .006);
  box(charcoal, .154, .013, .130, .202, .727, .888, .005);
  box(paper, .074, .0015, .058, .202, .735, .888, .001);
  for (const x of [.136, .268]) bolt(p(x, .736, .889), up, .0035);
  for (const [offset, radius] of [[0, .013], [.055, .010]]) {
    hose(rubber, [[.053 + offset!, .647, .840], [.092 + offset!, .661, .912], [.120 + offset!, .581, 1.052], [.11 + offset!, .541, 1.097]], radius!, 24, 9);
    clamp(p(.053 + offset!, .647, .851), front, radius!);
  }
  const loom = hose(rubber, [[-.550, .683, 1.44], [-.547, .674, 1.23], [-.553, .652, .949], [-.472, .739, .863], [-.192, .747, .860], [.050, .736, .857], [.163, .692, .871]], .011, 48, 10);
  for (const t of [.08, .28, .43, .58, .75, .91]) ring(steel, .0115, .0027, loom.getPoint(t), loom.getTangent(t), 14);
  for (let i = 0; i < 3; i++) {
    hose(i === 1 ? red : charcoal, [[.124 + i * .011, .692, .941], [.13 + i * .019, .708, 1.00], [.020 + i * .012, .730, 1.07], [-.055 + i * .012, .717, 1.103]], .0025, 22, 6);
  }

  // Material batching keeps the rich source geometry inexpensive to submit.
  let bayTriangles = 0;
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error(`Could not assemble ${material.name}`);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    bayTriangles += geometry.getAttribute('position').count / 3;
    parts.forEach(part => part.dispose());
  }
  group.userData.engineBay = {
    bayTriangles,
    engineTriangles: engine.userData.engineAssembly.triangleCount,
    materialBatches: batches.size + engine.children.length,
    facing: '+Z',
    mountedEngine: true,
  };
  return group;
}
