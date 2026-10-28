import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Complete period engine; bottom is y=0, accessories face +Z. */
export function createGarageEngine(options: { mounted?: boolean } = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SORA period twin-cam four-cylinder engine';
  const material = (name: string, color: string, roughness: number, metalness: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = `Engine / ${name}`;
    return m;
  };
  const aluminium = material('cast aluminium', '#a09b89', .55, .68);
  const machined = material('machined aluminium edges', '#d4c8ad', .31, .79);
  const iron = material('oxidised iron', '#414441', .78, .5);
  const red = material('satin vermilion rocker cover', '#963d30', .53, .24);
  const darkRed = material('red enamel recess', '#4d2522', .69, .16);
  const rubber = material('rubber hoses and belt', '#20282c', .91, .02);
  const brass = material('brass fittings', '#b19654', .41, .69);
  const exhaust = material('heat-stained steel headers', '#7b7469', .64, .68);
  const ivory = material('enameled lettering', '#e6d7b4', .54, .16);
  const blue = material('blue ignition leads', '#344d61', .76, .02);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const up = new THREE.Vector3(0, 1, 0);
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(g: THREE.BufferGeometry, m: THREE.Material, p = point(0, 0, 0), rotation?: THREE.Euler) {
    if (rotation) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    g.translate(p.x, p.y, p.z);
    const flat = g.index ? g.toNonIndexed() : g;
    // Every primitive retains its own normals and UVs when batched.
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    if (!flat.getAttribute('uv')) flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.getAttribute('position').count * 2), 2));
    let parts = batches.get(m);
    if (!parts) { parts = []; batches.set(m, parts); }
    parts.push(flat);
    if (flat !== g) g.dispose();
  }
  function rounded(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, radius = .006) {
    add(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4)), m, point(x, y, z));
  }
  function cylinder(m: THREE.Material, radius: number, length: number, p: THREE.Vector3, axis = up, segments = 24, topRadius = radius) {
    const g = new THREE.CylinderGeometry(topRadius, radius, length, segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, axis.clone().normalize()));
    add(g, m, p);
  }
  function rod(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number, segments = 10) {
    cylinder(m, radius, a.distanceTo(b), a.clone().lerp(b, .5), b.clone().sub(a), segments);
  }
  function ring(m: THREE.Material, radius: number, tube: number, p: THREE.Vector3, axis = point(0, 0, 1), segments = 32) {
    const g = new THREE.TorusGeometry(radius, tube, 6, segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(point(0, 0, 1), axis.clone().normalize()));
    add(g, m, p);
  }
  function hose(m: THREE.Material, positions: number[][], radius: number, segments = 24, radial = 8) {
    const path = new THREE.CatmullRomCurve3(positions.map(p => point(p[0]!, p[1]!, p[2]!)), false, 'centripetal');
    add(new THREE.TubeGeometry(path, segments, radius, radial, false), m);
  }
  function bolt(p: THREE.Vector3, axis = up, radius = .006) {
    cylinder(iron, radius * 1.25, .0025, p, axis, 12);
    cylinder(machined, radius, .006, p.clone().addScaledVector(axis, .003), axis, 6);
    // Dark centre creates a recessed, legible fastener instead of a shiny dot.
    cylinder(iron, radius * .34, .0008, p.clone().addScaledVector(axis, .0065), axis, 6);
  }
  function extrusion(m: THREE.Material, profile: number[][], depth: number, z: number, bevel = .004) {
    const shape = new THREE.Shape();
    profile.forEach((p, i) => i ? shape.lineTo(p[0]!, p[1]!) : shape.moveTo(p[0]!, p[1]!));
    shape.closePath();
    add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8 }), m, point(0, 0, z));
  }

  // Bracket feet support the sump clear of the workbench.
  for (const x of options.mounted ? [] : [-.125, .125]) {
    rounded(iron, .10, .018, .46, x, .009, -.008, .006);
    for (const z of [-.18, .16]) {
      extrusion(iron, [[x - .021, .016], [x + .021, .016], [x + .026, .15], [x - .026, .15]], .034, z - .017);
      bolt(point(x, .021, z));
    }
  }
  extrusion(iron, [[-.12, .085], [-.14, .13], [-.147, .17], [.147, .17], [.133, .095], [.095, .068], [-.085, .068]], .428, -.224, .008);
  rounded(aluminium, .326, .026, .492, 0, .184, -.004, .007);
  for (const x of [-.145, .145]) for (let z = -.204; z <= .205; z += .068) bolt(point(x, .2, z), up, .0047);
  cylinder(brass, .012, .013, point(.06, .086, .218), point(0, 0, 1), 6);
  // Cast block silhouette and four raised cylinder jackets.
  extrusion(iron, [[-.141, .2], [-.146, .30], [-.125, .385], [-.116, .423], [.116, .423], [.14, .338], [.145, .21]], .454, -.23, .007);
  const stations = [-.176, -.06, .056, .172];
  for (const z of stations) {
    cylinder(iron, .072, .205, point(0, .319, z), up, 20);
    for (const side of [-1, 1]) {
      cylinder(aluminium, .031, .013, point(side * .145, .335, z), point(side, 0, 0), 24);
      cylinder(iron, .025, .014, point(side * .150, .335, z), point(side, 0, 0), 24);
      cylinder(brass, .020, .015, point(side * .152, .335, z), point(side, 0, 0), 24);
      rod(aluminium, point(side * .143, .22, z - .043), point(side * .127, .403, z - .043), .006);
    }
  }
  // Layered head, gasket, ribs, and twin cam towers.
  rounded(darkRed, .304, .009, .493, 0, .43, -.005, .004);
  rounded(aluminium, .304, .083, .488, 0, .475, -.005, .01);
  for (const y of [.445, .464, .487, .51]) for (const side of [-1, 1]) rounded(machined, .008, .005, .443, side * .154, y, -.008, .002);
  rounded(rubber, .294, .008, .487, 0, .522, -.005, .004);
  extrusion(red, [[-.146, .526], [-.146, .565], [-.13, .591], [-.103, .605], [-.053, .605], [-.035, .588], [.035, .588], [.053, .605], [.104, .605], [.131, .59], [.146, .565], [.146, .526]], .470, -.24, .008);
  // Thin machined fins follow each cam cover rather than reading as large blocks.
  for (const x of [-.113, -.087, -.061, .061, .087, .113]) rounded(machined, .008, .006, .375, x, .61, -.024, .002);
  for (const x of [-.137, .137]) for (const z of [-.213, -.068, .077, .209]) bolt(point(x, .572, z), up, .006);
  // Four sparkplug wells, ceramic boots, and a separate continuous lead per cylinder.
  for (let i = 0; i < stations.length; i++) {
    const z = stations[i]!, terminalAngle = Math.PI / 4 + i * Math.PI / 2;
    cylinder(iron, .019, .007, point(0, .592, z));
    cylinder(ivory, .010, .026, point(0, .607, z), up, 12);
    cylinder(rubber, .012, .022, point(0, .625, z), up, 12);
    hose(blue, [[0, .637, z], [-.033, .652, z - .007], [-.17 - i * .009, .595, z - .029], [-.188 - i * .009, .45, .115], [-.190 + Math.cos(terminalAngle) * .022, .399 + Math.sin(terminalAngle) * .022, .276]], .0038, 26, 7);
  }
  cylinder(iron, .026, .038, point(.102, .617, .175), up, 24);
  cylinder(rubber, .029, .013, point(.102, .641, .175), up, 24);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    rod(iron, point(.102 + Math.cos(a) * .025, .644, .175 + Math.sin(a) * .025), point(.102 + Math.cos(a) * .031, .644, .175 + Math.sin(a) * .031), .0028, 6);
  }

  // Intake: four distinct S-shaped cast runners and a long plenum with end cap.
  for (const z of stations) {
    rounded(aluminium, .018, .068, .080, .16, .485, z);
    for (const y of [.461, .509]) bolt(point(.173, y, z), point(1, 0, 0), .0048);
    hose(aluminium, [[.16, .482, z], [.215, .466, z], [.274, .49, z], [.28, .554, z], [.259, .569, z]], .0255, 30, 12);
    ring(machined, .026, .004, point(.176, .482, z), point(1, 0, 0), 20);
  }
  cylinder(aluminium, .064, .44, point(.261, .576, -.007), point(0, 0, 1), 36);
  cylinder(machined, .065, .008, point(.261, .576, -.231), point(0, 0, 1), 36);
  cylinder(machined, .063, .017, point(.261, .576, .22), point(0, 0, 1), 36);
  cylinder(aluminium, .045, .059, point(.261, .576, .25), point(0, 0, 1), 28);
  cylinder(rubber, .038, .002, point(.261, .576, .281), point(0, 0, 1), 28);
  ring(machined, .040, .004, point(.261, .576, .285), point(0, 0, 1), 32);
  cylinder(brass, .028, .002, point(.261, .576, .283), point(0, 0, 1), 24);
  rod(iron, point(.219, .576, .287), point(.303, .576, .287), .0038);
  rod(machined, point(.312, .54, .244), point(.312, .614, .244), .005);
  hose(rubber, [[.312, .614, .244], [.329, .631, .14], [.279, .65, -.075], [.175, .596, -.225]], .004, 26, 7);
  for (const z of [-.19, .18]) bolt(point(.26, .64, z), up, .006);
  // Copper fuel rail and short flexible injector connections.
  rod(brass, point(.19, .556, -.215), point(.19, .556, .196), .008, 12);
  for (const z of stations) {
    cylinder(brass, .010, .018, point(.19, .555, z), point(0, 0, 1), 6);
    hose(rubber, [[.19, .55, z], [.205, .535, z], [.193, .507, z]], .005, 10, 7);
  }

  // Four exhaust primaries join a collector; continuous tubes preserve their silhouette.
  for (let i = 0; i < stations.length; i++) {
    const z = stations[i]!;
    rounded(exhaust, .018, .062, .078, -.167, .479, z);
    for (const y of [.455, .503]) bolt(point(-.179, y, z), point(-1, 0, 0), .0045);
    hose(exhaust, [[-.17, .479, z], [-.215, .477, z], [-.289 - i * .007, .409, z + .008], [-.319, .31 - i * .025, z + .029], [-.293, .19, .17 + (i - 1.5) * .016]], .019, 30, 10);
    ring(machined, .020, .0023, point(-.213, .476, z), point(-1, -.2, 0), 20);
  }
  hose(exhaust, [[-.293, .2, .168], [-.30, .162, .20], [-.306, .127, .245]], .039, 15, 14);
  ring(machined, .041, .005, point(-.306, .128, .244), point(0, -.65, .76), 28);
  // Front timing cover, cast pads and clearly separated accessory drive wheels.
  extrusion(aluminium, [[-.071, .188], [-.094, .228], [-.058, .284], [-.06, .403], [-.139, .45], [-.144, .516], [-.111, .551], [-.061, .54], [0, .508], [.062, .54], [.113, .551], [.144, .516], [.139, .45], [.06, .402], [.059, .284], [.09, .226], [.067, .188]], .025, .245, .004);
  for (const x of [-.087, .087]) {
    cylinder(iron, .047, .02, point(x, .492, .287), point(0, 0, 1), 28);
    ring(machined, .046, .003, point(x, .492, .3));
    bolt(point(x, .492, .3), point(0, 0, 1), .009);
  }
  for (const p of [[-.063, .207], [.064, .208], [-.043, .331], [.044, .357], [-.128, .525], [.128, .525]]) bolt(point(p[0]!, p[1]!, .275), point(0, 0, 1), .005);
  function pulley(x: number, y: number, radius: number, z: number) {
    cylinder(iron, radius, .027, point(x, y, z), point(0, 0, 1), 36);
    for (const dz of [-.013, -.006, .006, .013]) ring(machined, radius, .0021, point(x, y, z + dz), point(0, 0, 1), 36);
    cylinder(aluminium, radius * .61, .006, point(x, y, z + .017), point(0, 0, 1), 32);
    cylinder(iron, radius * .43, .007, point(x, y, z + .02), point(0, 0, 1), 24);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      rod(machined, point(x + Math.cos(a) * radius * .14, y + Math.sin(a) * radius * .14, z + .025), point(x + Math.cos(a) * radius * .58, y + Math.sin(a) * radius * .58, z + .025), .003, 6);
    }
    bolt(point(x, y, z + .027), point(0, 0, 1), .007);
  }
  pulley(0, .223, .076, .300);
  pulley(.007, .382, .046, .300);
  pulley(.222, .264, .040, .300);
  // Alternator has a ventilated cast housing, fan, mounting ears and terminal.
  cylinder(aluminium, .059, .105, point(.225, .264, .212), point(0, 0, 1), 32);
  for (let i = 0; i < 14; i++) {
    const a = i * Math.PI / 7, x = .225 + Math.cos(a) * .056, y = .264 + Math.sin(a) * .056;
    rod(iron, point(x, y, .179), point(x, y, .24), .004, 6);
    rod(machined, point(x, y, .181), point(x + Math.cos(a) * .006, y + Math.sin(a) * .006, .181), .003, 6);
  }
  for (const z of [.168, .258]) ring(machined, .059, .004, point(.225, .264, z), point(0, 0, 1));
  cylinder(brass, .009, .022, point(.278, .264, .191), point(1, 0, 0), 6);
  hose(red, [[.29, .264, .191], [.31, .22, .145], [.246, .171, .034], [.174, .192, -.045]], .0048, 22, 7);
  rod(aluminium, point(.113, .223, .236), point(.226, .323, .233), .011);
  rod(iron, point(.132, .358, .236), point(.247, .295, .252), .007);
  // A flat continuous belt with visible width, swept around the three wheels.
  const beltPath = new THREE.CatmullRomCurve3([
    point(-.076, .223, .3), point(-.054, .166, .3), point(0, .147, .3),
    point(.057, .174, .3), point(.246, .231, .3), point(.262, .264, .3),
    point(.243, .299, .3), point(.031, .422, .3), point(-.021, .420, .3),
    point(-.039, .382, .3),
  ], true, 'centripetal');
  const beltVertices: number[] = [], beltIndices: number[] = [];
  const beltSegments = 120;
  for (let i = 0; i <= beltSegments; i++) {
    const t = i / beltSegments, p = beltPath.getPointAt(t), tangent = beltPath.getTangentAt(t);
    const n = point(-tangent.y, tangent.x, 0).normalize();
    for (const [side, face] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = p.clone().addScaledVector(n, side! * .003);
      beltVertices.push(q.x, q.y, q.z + face! * .009);
    }
  }
  for (let i = 0; i < beltSegments; i++) for (let side = 0; side < 4; side++) {
    const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
    beltIndices.push(a, b, a + 4, b, b + 4, a + 4);
  }
  const belt = new THREE.BufferGeometry();
  belt.setAttribute('position', new THREE.Float32BufferAttribute(beltVertices, 3));
  belt.setIndex(beltIndices); belt.computeVertexNormals(); add(belt, rubber);

  // Distributor, service connections and flexible plumbing make a complete assembly.
  cylinder(iron, .033, .053, point(-.190, .399, .207), point(0, 0, 1), 24);
  cylinder(darkRed, .035, .026, point(-.190, .399, .244), point(0, 0, 1), 24);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    cylinder(rubber, .008, .018, point(-.190 + Math.cos(a) * .022, .399 + Math.sin(a) * .022, .263), point(0, 0, 1), 12);
  }
  hose(rubber, [[.027, .487, .279], [.072, .491, .299], [.113, .446, .295], [.148, .405, .249], [.184, .411, .16]], .016, 32, 12);
  for (const z of [.132, .15, .169]) ring(machined, .018, .002, point(.184, .411, z));
  hose(rubber, [[-.081, .574, -.244], [-.103, .559, -.269], [-.16, .47, -.26], [-.163, .363, -.223]], .013, 28, 10);
  ring(machined, .014, .003, point(-.081, .574, -.243), point(0, 0, 1), 24);
  // A short corrugated breather attaches to the oil separator at the rear.
  cylinder(iron, .026, .089, point(.15, .343, -.219), up, 20);
  hose(rubber, [[.15, .392, -.219], [.19, .41, -.239], [.19, .518, -.236], [.145, .57, -.224]], .008, 24, 8);
  for (let i = 0; i < 8; i++) ring(iron, .0087, .002, point(.19, .424 + i * .01, -.239), up, 16);
  hose(blue, [[.13, .316, -.205], [.179, .288, -.177], [.172, .257, -.067], [.144, .246, .115]], .0044, 22, 8);
  cylinder(brass, .012, .015, point(.149, .282, -.14), point(1, 0, 0), 6);
  cylinder(rubber, .011, .016, point(.165, .282, -.14), point(1, 0, 0), 12);
  // Removable dipstick: a bent metal tube and an open ring handle.
  hose(brass, [[.145, .204, .042], [.213, .238, .045], [.325, .347, .009], [.351, .456, -.008]], .0041, 26, 8);
  ring(brass, .017, .0035, point(.351, .474, -.008), point(0, 0, 1), 28);
  cylinder(rubber, .007, .020, point(.351, .445, -.008));

  // Original raised lettering is geometry, so it works without font or texture loading.
  const glyphs: Record<string, number[][][]> = {
    S: [[[1, 1], [0, 1], [0, .52], [1, .52], [1, 0], [0, 0]]],
    O: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    R: [[[0, 0], [0, 1], [1, 1], [1, .54], [0, .54]], [[.45, .54], [1, 0]]],
    A: [[[0, 0], [.5, 1], [1, 0]], [[.23, .43], [.77, .43]]],
    '1': [[[.23, .78], [.57, 1], [.57, 0]], [[.13, 0], [1, 0]]],
    '6': [[[1, 1], [.22, 1], [0, .64], [0, 0], [1, 0], [1, .51], [0, .51]]],
    V: [[[0, 1], [.5, 0], [1, 1]]],
    L: [[[0, 1], [0, 0], [1, 0]]],
    E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, .52], [.8, .52]]],
  };
  function inscription(text: string, height: number, origin: THREE.Vector3, top: boolean) {
    const width = height * .60, spacing = height * .25;
    const total = text.length * (width + spacing) - spacing;
    for (let i = 0; i < text.length; i++) {
      for (const stroke of glyphs[text[i]!] ?? []) for (let j = 1; j < stroke.length; j++) {
        const at = (p: number[]) => top
          ? point(origin.x - total / 2 + i * (width + spacing) + p[0]! * width, origin.y, origin.z - p[1]! * height)
          : point(origin.x - total / 2 + i * (width + spacing) + p[0]! * width, origin.y + p[1]! * height, origin.z);
        rod(ivory, at(stroke[j - 1]!), at(stroke[j]!), height * .045, 6);
      }
    }
  }
  rounded(darkRed, .099, .006, .073, -.087, .614, -.126, .003);
  inscription('SORA', .026, point(-.087, .619, -.128), true);
  inscription('16VALVE', .012, point(-.087, .619, -.101), true);
  rounded(iron, .094, .033, .004, 0, .441, .279, .002);
  inscription('SORA', .012, point(0, .44, .282), false);
  inscription('16VALVE', .007, point(0, .428, .282), false);
  for (const x of [-.043, .043]) bolt(point(x, .442, .283), point(0, 0, 1), .0025);

  let triangleCount = 0;
  for (const [m, parts] of batches) {
    const merged = mergeGeometries(parts, false);
    if (!merged) throw new Error(`Could not assemble ${m.name}`);
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = m.name; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); triangleCount += merged.getAttribute('position').count / 3;
    parts.forEach(g => g.dispose());
  }
  const bounds = new THREE.Box3().setFromObject(group);
  // Guarantee a bench-placement origin even if the support feet are adjusted later.
  for (const child of group.children) child.position.y -= bounds.min.y;
  group.userData.engineAssembly = { cylinders: 4, triangleCount, materialBatches: batches.size, facing: '+Z', bottom: 0 };
  return group;
}
