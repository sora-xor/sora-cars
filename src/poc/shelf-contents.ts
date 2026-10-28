import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SHELVES = [.5375, 1.3375, 2.1875, 3.0375] as const;

/** Four authored arrangements. X spans the shelf; +Z faces into the garage. */
export function createWorkshopShelfContents(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Workshop shelf: oil, service parts, manuals and riding kit';
  const matte = (name: string, color: string, metalness = .03, roughness = .76) => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    material.name = `Workshop ${name}`;
    return material;
  };
  const steel = matte('tinplate', '#a8a49a', .7, .42);
  const darkSteel = matte('oiled steel', '#333b3e', .58, .54);
  const cream = matte('old ivory enamel', '#e0d0a5', .12, .59);
  const red = matte('oxide red enamel', '#9e3f2e', .1, .61);
  const blue = matte('indigo enamel', '#364d61', .1, .65);
  const green = matte('sage enamel', '#6f8171', .1, .66);
  const ochre = matte('ochre enamel', '#bf9851', .1, .63);
  const card = matte('corrugated kraft', '#a98656', 0, .96);
  const edge = matte('cardboard fold edges', '#6b5037', 0, .98);
  const tape = matte('paper parcel tape', '#c5a775', 0, .88);
  const paper = matte('aged paper', '#d2c09a', 0, 1);
  const rubber = matte('dark rubber', '#23272d', 0, .95);
  const cloth = matte('blue cotton rag', '#54666e', 0, .98);
  cloth.side = THREE.DoubleSide;
  const clothLight = matte('oatmeal cotton rag', '#b2a17f', 0, .98);
  clothLight.side = THREE.DoubleSide;
  const visor = matte('smoked helmet visor', '#17242c', .26, .23);

  // One original print atlas supplies the labels. Painted marks are part of
  // the objects' albedo, and therefore work from every real camera position.
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = 2048;
  const ctx = atlas.getContext('2d')!;
  const labels = [
    ['SORA', 'MOTOR OIL', '20W–50 / 1 L', '#d9c9a2', '#963729'],
    ['天', '機械油', '精製油 / 500 ml', '#344b56', '#dbcda6'],
    ['SORA', 'GREASE', '万能グリース / No. 2', '#b04531', '#e3d2aa'],
    ['SERVICE', 'ブレーキ', 'FLUID / DOT 3', '#b7bdae', '#364b49'],
    ['SORA 部品', '点火プラグ', '4本入 / 1986', '#d8c69b', '#425567'],
    ['精密部品', 'AIR FILTER', '取扱注意 / A–86', '#d5c19a', '#833d2c'],
    ['SORA', '整備手帳', 'SERVICE NOTES / 86', '#435461', '#daca9f'],
    ['整備用', '清掃液', 'CLEANER / 250 ml', '#cba756', '#403d35'],
    ['SORA', '予備部品', '保管用 / GARAGE 01', '#d8c59c', '#454739'],
    ['走る仲間', 'MOTOR CLUB', 'SORA / 1986', '#dbcca8', '#9b3c2d'],
    ['整備記録', 'AE86', 'ENGINE / 4A', '#a94732', '#dfcda7'],
    ['SORA', 'ベルト', 'FAN BELT / 86–04', '#cec7a9', '#365550'],
    ['純綿', 'WORK CLOTH', '洗濯済 / SORA', '#c6b387', '#4b524d'],
    ['SORA', 'POLISH', '金属みがき / 300 g', '#6c7d71', '#e0d1ae'],
    ['電装部品', '12 VOLT', 'FUSES / 10 A', '#dccba4', '#a44831'],
    ['SERVICE', '配線図', 'TECHNICAL MANUAL', '#b49865', '#364553'],
  ];
  labels.forEach(([brand, name, detail, background, ink], index) => {
    const x = (index % 4) * 512, y = Math.floor(index / 4) * 512;
    ctx.fillStyle = background!; ctx.fillRect(x, y, 512, 512);
    ctx.strokeStyle = ink!; ctx.lineWidth = 7; ctx.strokeRect(x + 24, y + 23, 464, 466);
    ctx.fillStyle = ink!; ctx.fillRect(x + 26, y + 26, 460, 57);
    ctx.fillStyle = background!; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText('SORA MOTOR CLUB ・ 整備用品', x + 256, y + 57, 435);
    ctx.fillStyle = ink!; ctx.font = '900 78px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(brand!, x + 256, y + 164, 423);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 65, y + 225); ctx.lineTo(x + 447, y + 225); ctx.stroke();
    ctx.font = 'bold 51px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(name!, x + 256, y + 290, 422);
    ctx.font = '24px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(detail!, x + 256, y + 358, 424);
    ctx.font = '19px monospace'; ctx.fillText(`LOT 86 – ${102 + index * 7}    MADE IN JAPAN`, x + 256, y + 420, 420);
    // Short printed rules and scuffed borders distinguish a used label from a
    // clean UI sticker. No random full-frame noise is involved.
    for (let line = 0; line < 3; line++) ctx.fillRect(x + 95, y + 453 + line * 7, 320 - line * 31, 2);
    ctx.globalAlpha = .29; ctx.fillStyle = background!;
    for (let k = 0; k < 53; k++) {
      const sx = x + 22 + ((k * 157 + index * 43) % 469);
      const sy = y + 24 + ((k * 193 + index * 29) % 461);
      ctx.fillRect(sx, sy, 2 + (k % 9), 1 + (k % 3));
    }
    ctx.globalAlpha = 1;
  });
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const print = new THREE.MeshStandardMaterial({ map: texture, roughness: .92 });
  print.name = 'Workshop printed labels';

  function put(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z); object.rotation.set(rx, ry, rz);
    parent.add(object); return object;
  }
  function box(parent: THREE.Object3D, material: THREE.Material, w: number, h: number, d: number,
    x = 0, y = 0, z = 0, radius = .003) {
    return put(parent, radius > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 4, h / 4, d / 4))
      : new THREE.BoxGeometry(w, h, d), material, x, y, z);
  }
  function cylinder(parent: THREE.Object3D, material: THREE.Material, r: number, height: number,
    x: number, y: number, z: number, top = r, segments = 24) {
    return put(parent, new THREE.CylinderGeometry(top, r, height, segments), material, x, y, z);
  }
  function ring(parent: THREE.Object3D, material: THREE.Material, r: number, tube: number,
    x: number, y: number, z: number) {
    return put(parent, new THREE.TorusGeometry(r, tube, 5, 32), material, x, y, z, Math.PI / 2);
  }
  function tube(parent: THREE.Object3D, material: THREE.Material, points: number[][], radius: number) {
    return put(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2]))),
      Math.max(12, points.length * 4), radius, 6, false), material);
  }
  function atlasUv(geometry: THREE.BufferGeometry, index: number) {
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (index % 4 + .025 + uv.getX(i) * .95) / 4,
        (3 - Math.floor(index / 4) + .025 + uv.getY(i) * .95) / 4);
    }
    return geometry;
  }
  function label(parent: THREE.Object3D, index: number, w: number, h: number, x: number, y: number, z: number) {
    return put(parent, atlasUv(new THREE.PlaneGeometry(w, h), index), print, x, y, z);
  }
  function place(x: number, level: number, z = 0, yaw = 0) {
    const group = new THREE.Group(); group.position.set(x, SHELVES[level]!, z); group.rotation.y = yaw; root.add(group); return group;
  }

  function tin(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, h: number,
    material: THREE.Material, labelIndex: number, pullTab = false) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
    // The slightly tapered body, crimped lid and inset top catch separate lines
    // of light; the printed wrapper does not stand in for the can's geometry.
    cylinder(group, material, radius, h - .018, 0, h / 2, 0, radius * .97, 32);
    cylinder(group, steel, radius * .985, .009, 0, h - .005, 0);
    cylinder(group, darkSteel, radius * .87, .002, 0, h + .001, 0);
    cylinder(group, steel, radius * .81, .002, 0, h + .003, 0);
    for (const yy of [.009, h - .011, h + .002]) ring(group, steel, radius * .985, .004, 0, yy, 0);
    put(group, atlasUv(new THREE.CylinderGeometry(radius * 1.001, radius * 1.025, h * .66, 24, 1, true, -.97, 1.94), labelIndex), print, 0, h * .49, 0);
    // Pressed body seam, small cap and a real pull ring on selected stock.
    box(group, steel, .006, h * .83, .003, -radius * .61, h * .47, radius * .8, 0);
    if (pullTab) {
      const tab = ring(group, steel, radius * .21, .0034, 0, h + .009, radius * .18); tab.scale.z = .62;
      cylinder(group, darkSteel, .007, .005, 0, h + .005, -radius * .04, .007, 12);
    } else {
      cylinder(group, material, radius * .2, .022, radius * .39, h + .012, 0, radius * .21, 16);
      ring(group, steel, radius * .21, .002, radius * .39, h + .024, 0);
    }
    return group;
  }

  function jug(parent: THREE.Object3D, material: THREE.Material, labelIndex: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-.145, .018); shape.lineTo(-.155, .30); shape.lineTo(-.115, .385);
    shape.lineTo(-.105, .42); shape.lineTo(-.01, .42); shape.lineTo(.015, .368);
    shape.lineTo(.125, .39); shape.quadraticCurveTo(.174, .36, .164, .28);
    shape.lineTo(.145, .018); shape.quadraticCurveTo(0, -.008, -.145, .018);
    const handle = new THREE.Path();
    handle.moveTo(.034, .276); handle.quadraticCurveTo(.022, .35, .064, .35);
    handle.lineTo(.112, .352); handle.quadraticCurveTo(.138, .326, .116, .275); handle.closePath();
    shape.holes.push(handle);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .155, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .012, bevelThickness: .009, curveSegments: 12 });
    geometry.translate(0, .013, -.0775); put(parent, geometry, material);
    cylinder(parent, darkSteel, .053, .042, -.056, .449, 0, .049, 32);
    for (let i = 0; i < 18; i++) {
      const a = i * Math.PI / 9;
      box(parent, material, .006, .029, .006, -.056 + Math.cos(a) * .051, .449, Math.sin(a) * .051, .001);
    }
    label(parent, labelIndex, .237, .198, -.005, .17, .087);
    for (const xx of [-.142, .142]) box(parent, material, .011, .19, .01, xx, .135, .081, .003);
  }

  function carton(parent: THREE.Object3D, w: number, h: number, d: number, index: number, open = false) {
    box(parent, card, w, h, d, 0, h / 2, 0, .008);
    // Fold lines, overlapping top flaps, tape wrapping over the front edge.
    for (const xx of [-w / 2 + .008, w / 2 - .008]) box(parent, edge, .008, h - .014, .002, xx, h / 2, d / 2 + .001, 0);
    box(parent, edge, w - .016, .005, .002, 0, .02, d / 2 + .002, 0);
    box(parent, edge, .005, .002, d - .01, 0, h + .001, 0, 0);
    box(parent, tape, .074, .002, d + .008, -.02, h + .003, 0, 0);
    box(parent, tape, .074, h * .28, .002, -.02, h * .86, d / 2 + .003, 0);
    label(parent, index, w * .76, h * .62, .012, h * .48, d / 2 + .0035);
    if (open) {
      const flap = box(parent, card, w * .49, .012, d - .012, -w * .265, h + .044, 0, .001); flap.rotation.z = -.28;
      box(parent, darkSteel, w * .42, .002, d * .64, w * .22, h + .007, 0, 0);
      for (let i = 0; i < 3; i++) {
        const small = new THREE.Group(); small.position.set(.025 + i * w * .12, h + .009, .03); small.rotation.z = .03 * (i - 1); parent.add(small);
        box(small, cream, w * .105, .13, d * .53, 0, .065, 0, .003);
        label(small, 14, w * .083, .08, 0, .06, d * .265 + .002);
      }
    }
  }

  function manual(parent: THREE.Object3D, w: number, d: number, thickness: number, index: number, color: THREE.Material) {
    box(parent, paper, w - .012, thickness - .011, d - .012, .003, thickness / 2, 0, .001);
    for (const yy of [.003, thickness - .003]) box(parent, color, w + .008, .006, d + .008, 0, yy, 0, .001);
    box(parent, color, .015, thickness, d + .008, -w / 2, thickness / 2, 0, .003);
    for (let y = .011; y < thickness - .004; y += .009) box(parent, tape, w - .015, .001, .001, .003, y, d / 2 - .005, 0);
    const cover = label(parent, index, w * .86, d * .85, 0, thickness + .001, 0); cover.rotation.x = -Math.PI / 2;
    const spine = label(parent, index, w * .67, thickness * .61, 0, thickness / 2, d / 2 + .005); spine.rotation.z = .01;
  }

  function foldedRag(parent: THREE.Object3D, material: THREE.Material, w = .45, d = .27) {
    for (let layer = 0; layer < 3; layer++) {
      const geometry = new THREE.PlaneGeometry(w - layer * .018, d, 22, 14); geometry.rotateX(-Math.PI / 2);
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        p.setY(i, .014 + layer * .014 + .012 * Math.sin(x * 27 + z * 14) + .006 * Math.sin(x * 61 - z * 9));
      }
      geometry.computeVertexNormals(); put(parent, geometry, material, layer * .007, 0, 0);
    }
    tube(parent, paper, [[-.21, .052, .129], [-.09, .057, .133], [.03, .049, .131], [.17, .042, .134], [.218, .047, .128]], .0015);
  }

  function funnel(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
    const profile = [[.011, 0], [.02, .07], [.034, .10], [.116, .224], [.122, .224], [.12, .237], [.111, .232], [.027, .108], [.014, .077], [.008, 0]];
    const object = put(parent, new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 32), steel, x, y, z); object.scale.setScalar(scale);
    return object;
  }

  function helmet(parent: THREE.Object3D) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const around = 48, rows = 28;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= around; col++) {
      const theta = row / rows * 2.16, phi = col / around * Math.PI * 2;
      const nx = Math.sin(theta) * Math.sin(phi), ny = Math.cos(theta), nz = Math.sin(theta) * Math.cos(phi);
      positions.push(nx * .249, .18 + ny * .272, nz * .263); normals.push(nx, ny, nz); uvs.push(col / around, 1 - row / rows);
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < around; col++) {
      const theta = (row + .5) / rows * 2.16, phi = (col + .5) / around * Math.PI * 2;
      if (theta > .94 && theta < 1.71 && (phi < .99 || phi > Math.PI * 2 - .99)) continue;
      const a = row * (around + 1) + col, b = a + around + 1; indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    put(parent, geometry, cream);
    const shield = put(parent, new THREE.SphereGeometry(.245, 32, 12, Math.PI * .18, Math.PI * .64, .94, .78), visor, 0, .18, 0); shield.scale.set(1, 1.1, 1.065);
    for (const theta of [.94, 1.71]) {
      const line = Array.from({ length: 15 }, (_, i) => {
        const a = -.99 + i / 14 * 1.98;
        return [Math.sin(theta) * Math.sin(a) * .252, .18 + Math.cos(theta) * .274, Math.sin(theta) * Math.cos(a) * .267];
      }); tube(parent, rubber, line, .008);
    }
    const base = ring(parent, rubber, .208, .015, 0, .015, 0); base.scale.z = 1.03;
    for (const side of [-1, 1]) {
      const rivet = cylinder(parent, steel, .021, .01, side * .21, .235, .113, .021, 16); rivet.rotation.z = Math.PI / 2;
    }
    const chin = label(parent, 9, .24, .092, 0, .10, .247); chin.rotation.x = .15;
    // Narrow hand-applied red crown stripes, following the curved shell.
    for (const sign of [-1, 1]) tube(parent, red, Array.from({ length: 16 }, (_, i) => {
      const a = -.9 + i / 15 * 1.85;
      return [sign * .045, .18 + Math.cos(a) * .273, Math.sin(a) * .264];
    }), .010);
  }

  // Bottom: heavy fluids and unopened stock; gaps allow each silhouette to read.
  jug(place(-1.87, 0, -.02, -.1), red, 0);
  jug(place(-1.50, 0, -.075, .09), green, 3);
  const fluids = place(-.98, 0, .01, -.07);
  tin(fluids, -.10, 0, -.055, .113, .36, cream, 0);
  tin(fluids, .14, 0, .035, .102, .29, blue, 1, true);
  const bottomCarton = place(-.32, 0, -.014, .035); carton(bottomCarton, .58, .34, .40, 5);
  const partsStack = place(.31, 0, -.01, -.07); carton(partsStack, .46, .21, .35, 8);
  const topCarton = new THREE.Group(); topCarton.position.set(.025, .21, -.006); topCarton.rotation.y = .075; partsStack.add(topCarton); carton(topCarton, .40, .18, .31, 11);
  const bottomOil = place(.90, 0, .014); tin(bottomOil, -.11, 0, -.025, .127, .32, ochre, 2, true); tin(bottomOil, .16, 0, .037, .09, .22, red, 13, true);
  const storage = place(1.65, 0, -.01, -.045); carton(storage, .65, .40, .39, 8, true);

  // Second: active consumables, service literature and a rag put down mid-job.
  const books = place(-1.78, 1, -.007, .07);
  manual(books, .53, .38, .063, 6, blue);
  const book2 = new THREE.Group(); books.add(book2); book2.position.set(.009, .063, 0); book2.rotation.y = -.09; manual(book2, .48, .35, .045, 15, ochre);
  const rag = place(-1.19, 1, .022, -.13); foldedRag(rag, clothLight, .45, .29);
  const grease = place(-.64, 1, -.02); tin(grease, -.11, 0, -.045, .123, .14, red, 2, true); tin(grease, -.105, .152, -.045, .113, .12, green, 13, true); tin(grease, .15, 0, .067, .065, .29, cream, 7);
  jug(place(-.12, 1, -.031, -.14), cream, 0);
  const polish = place(.37, 1, .006); tin(polish, -.08, 0, -.072, .083, .25, green, 13); tin(polish, .10, 0, .072, .067, .20, ochre, 7);
  const plugs = place(.95, 1, 0, -.05); carton(plugs, .44, .145, .32, 4);
  for (let i = 0; i < 3; i++) {
    const small = new THREE.Group(); small.position.set(-.09 + i * .093, .148, .009); small.rotation.y = -.04 + i * .035; plugs.add(small);
    box(small, paper, .08, .16, .105, 0, .08, 0, .003); label(small, 4, .067, .133, 0, .08, .054);
  }
  const oiling = place(1.62, 1, 0, -.11);
  cylinder(oiling, red, .13, .18, -.02, .09, .01, .078, 32);
  ring(oiling, steel, .128, .004, -.02, .01, .01);
  cylinder(oiling, steel, .079, .012, -.02, .188, .01);
  tube(oiling, steel, [[-.03, .193, .01], [.015, .27, .006], [.14, .37, .004], [.19, .405, .003]], .009);
  tube(oiling, red, [[-.115, .15, .0], [-.225, .18, .0], [-.25, .09, .0], [-.13, .048, .0]], .013);
  label(oiling, 1, .135, .087, -.023, .085, .13);

  // Third: open repair stock, tall aerosol cans, spare pulleys and folded cotton.
  const repair = place(-1.77, 2, -.009, -.06); carton(repair, .53, .24, .37, 14, true);
  const sprays = place(-1.18, 2, .005);
  tin(sprays, -.09, 0, -.05, .063, .36, red, 7); tin(sprays, .067, 0, .038, .069, .40, blue, 1);
  const repairOil = place(-.73, 2, -.018, .10); tin(repairOil, 0, 0, 0, .118, .32, cream, 0);
  funnel(repairOil, .008, .343, .009, .8);
  const smallCartons = place(-.15, 2, -.019, -.03); carton(smallCartons, .57, .20, .35, 11);
  const carton2 = new THREE.Group(); carton2.position.set(.042, .2, -.015); carton2.rotation.y = .07; smallCartons.add(carton2); carton(carton2, .39, .15, .28, 4);
  const pulleys = place(.52, 2, .025);
  for (let i = 0; i < 3; i++) {
    cylinder(pulleys, darkSteel, .137 - i * .012, .038, 0, .02 + i * .044, 0, .137 - i * .012, 32);
    ring(pulleys, steel, .126 - i * .012, .003, 0, .041 + i * .044, 0);
    cylinder(pulleys, steel, .039, .047, 0, .026 + i * .044, 0, .039, 24);
    cylinder(pulleys, rubber, .018, .002, 0, .051 + i * .044, 0, .018, 16);
    for (let hole = 0; hole < 5; hole++) {
      const a = hole / 5 * Math.PI * 2;
      cylinder(pulleys, rubber, .016, .002, Math.cos(a) * .077, .041 + i * .044, Math.sin(a) * .077, .016, 12);
    }
  }
  const folded = place(1.0, 2, 0, .06); foldedRag(folded, cloth);
  const linenBand = label(folded, 12, .15, .17, 0, .065, .007); linenBand.rotation.x = -Math.PI / 2;
  const canCluster = place(1.69, 2, .004, -.035);
  tin(canCluster, -.12, 0, -.07, .097, .31, green, 3); tin(canCluster, .115, 0, .073, .072, .23, ochre, 7); tin(canCluster, .095, 0, -.135, .068, .28, red, 2, true);

  // Top: club riding kit and less frequently used hardware. Asymmetry is
  // intentional: a broad helmet sits against a run of smaller print details.
  const topBooks = place(-1.76, 3, 0, -.03);
  manual(topBooks, .57, .39, .077, 10, red);
  const lastManual = new THREE.Group(); lastManual.position.set(.014, .077, -.01); lastManual.rotation.y = .08; topBooks.add(lastManual); manual(lastManual, .52, .35, .051, 6, blue);
  const tins = place(-1.12, 3, -.005); tin(tins, -.1, 0, .012, .09, .24, cream, 0); tin(tins, .106, 0, -.04, .088, .31, blue, 1);
  const upperBox = place(-.48, 3, -.03, .025); carton(upperBox, .48, .31, .35, 8);
  const clothTop = place(.12, 3, .003, -.08); foldedRag(clothTop, clothLight, .43, .26);
  const spareFunnels = place(.67, 3, -.014);
  const broadFunnel = funnel(spareFunnels, -.02, .237 * 1.03, 0, 1.03); broadFunnel.rotation.x = Math.PI;
  const smallFunnel = funnel(spareFunnels, .16, .237 * .67, .068, .67); smallFunnel.rotation.x = Math.PI;
  helmet(place(1.56, 3, 0, -.12));

  // All objects are static scenery. Merge by material after baking their local
  // transforms: fine seams/rims remain geometry without hundreds of draw calls.
  root.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.deleteAttribute('tangent'); geometry.clearGroups();
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    const list = batches.get(material) ?? []; list.push(geometry); batches.set(material, list);
    object.geometry.dispose();
  });
  root.clear();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false)!;
    geometries.forEach(geometry => geometry.dispose());
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const object = new THREE.Mesh(merged, material); object.name = material.name;
    object.castShadow = object.receiveShadow = true; root.add(object);
  }
  root.userData.shelfTopHeights = [...SHELVES];
  return root;
}
