import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scannedSurface } from './surfaces';

export type ShopPropKind = 'vending' | 'workshop';
export interface ShopPropStats { meshes: number; triangles: number; bounds: { min: number[]; max: number[]; size: number[] } }
export interface ShopPropLibrary {
  /** Metre scale, ground-zero origin, frontage facing -Z. Geometry/materials are shared; do not dispose individual clones. */
  create(kind: ShopPropKind): THREE.Group;
  stats: Record<ShopPropKind, ShopPropStats>;
}

type Palette = ReturnType<typeof createPalette>;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const e = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);
const root = () => `${import.meta.env.BASE_URL}assets/models/shop-props/`;

function labelAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const labels = [
    ['#f1e8ce', '#a92e27', 'ソラの飲みもの', 'SORA REFRESHMENTS'],
    ['#f3e7c6', '#29292b', '100円', 'つめた〜い'],
    ['#eadfbd', '#265865', 'サイダー', 'SORA  CIDER'],
    ['#b89163', '#322a24', '珈琲', 'SORA  COFFEE'],
    ['#cf6936', '#f6e6bf', 'オレンジ', 'SORA  ORANGE'],
    ['#dedfc8', '#355b52', 'ソラ・スポーツ', 'SORA  SPORTS'],
    ['#315f76', '#f6eedb', 'つめたい', 'COLD  DRINKS'],
    ['#bfc1b8', '#282d30', '100・50・10', '硬貨を入れてください'],
    ['#d9d2ba', '#383b36', 'おつり', 'COIN RETURN'],
    ['#d9d2ba', '#383b36', '取出口', 'PUSH'],
    ['#872e2a', '#e6d9b8', 'SORA', 'MOTOR CLUB  •  1986'],
    ['#d7c39a', '#353b3b', 'MOTOR OIL', 'SAE 10W–30'],
    ['#ba4332', '#e6d8b7', '整備中', 'SERVICE BAY'],
    ['#252c2d', '#d6cfb7', '工具', 'TOOLS'],
    ['#d7c39a', '#353b3b', '部品', 'SPARE PARTS'],
    ['#a8acaa', '#292d2c', 'SORA 86', 'SERIAL  8604–0182'],
  ];
  // Print each tile at its real plate/wrap aspect before packing the square
  // atlas. Mapping a square typesetting layout onto a long fascia crushes text.
  const aspects = [6.833, 2.837, 2.142, 2.142, 2.142, 2.142, 4, 1.957, 3.188, 5.556, 2.25, .75, 2.25, 2.25, 2.727, 1.806];
  const draw = (): void => labels.forEach(([background, ink, main, sub], tile) => {
    const x = tile % 4 * 512, y = Math.floor(tile / 4) * 512;
    const plate = document.createElement('canvas'); plate.width = 768; plate.height = Math.round(768 / aspects[tile]!);
    const print = plate.getContext('2d')!, w = plate.width, h = plate.height;
    print.fillStyle = background!; print.fillRect(0, 0, w, h);
    print.strokeStyle = ink!; print.lineWidth = Math.max(1, h * .012);
    print.strokeRect(w * .035, h * .075, w * .93, h * .85);
    print.fillStyle = ink!; print.textAlign = 'center'; print.textBaseline = 'middle';
    print.font = `700 ${Math.min(h * .40, w * .12)}px "Hiragino Kaku Gothic ProN", SoraJP, sans-serif`;
    print.fillText(main!, w / 2, h * .42, w * .87);
    print.font = `600 ${Math.min(h * .16, w * .05)}px "Hiragino Kaku Gothic ProN", SoraJP, sans-serif`;
    print.fillText(sub!, w / 2, h * .73, w * .86);
    ctx.drawImage(plate, x, y, 512, 512);
  });
  draw();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  texture.name = 'Original SORA period product and service labels';
  void document.fonts.load('700 36px SoraJP', labels.map(label => label[2]).join(''))
    .catch(() => []).then(() => document.fonts.ready).then(() => { draw(); texture.needsUpdate = true; });
  return texture;
}

function createPalette() {
  const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: '#ffffff', metalness: 0.08, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.34 });
  const metal = new THREE.MeshStandardMaterial({ color: '#bfc6c7', roughness: 0.32, metalness: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: '#242827', roughness: 0.88, metalness: 0.06 });
  const wood = new THREE.MeshStandardMaterial({ ...scannedSurface('japanese_cedar_planks'), color: '#b1a38c', roughness: 0.86, normalScale: new THREE.Vector2(0.35, 0.35) });
  const labels = new THREE.MeshStandardMaterial({ map: labelAtlas(), roughness: 0.59, metalness: 0.02 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff2cf', emissive: '#ffde9d', emissiveIntensity: 0.6, roughness: 0.46 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d9e3de', metalness: 0.05, roughness: 0.12, transparent: true, opacity: 0.12, depthWrite: false });
  paint.name = 'Shop enamel'; metal.name = 'Brushed fittings'; dark.name = 'Rubber and recesses'; wood.name = 'Scanned cedar work surface';
  labels.name = 'Original product labels'; lamp.name = 'Warm fluorescent diffuser'; glass.name = 'Vending display glazing';
  return { paint, metal, dark, wood, labels, lamp, glass };
}

class Batch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(readonly palette: Palette) {}
  add(geometry: THREE.BufferGeometry, material: THREE.Material, at = v(0, 0, 0), rotation = e(), color = '#ffffff', scale = 1): void {
    geometry.scale(scale, scale, scale); geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation)); geometry.translate(at.x, at.y, at.z);
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    if (material === this.palette.wood) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        uv.setXY(i, (nx > nz ? p.getZ(i) : p.getX(i)) / 1.1, (ny > Math.max(nx, nz) ? p.getZ(i) : p.getY(i)) / 1.1);
      }
    }
    if (material === this.palette.paint) {
      const rgb = new THREE.Color(color), values = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < values.length; i += 3) { values[i] = rgb.r; values[i + 1] = rgb.g; values[i + 2] = rgb.b; }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
    }
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
    const parts = this.parts.get(material) ?? []; parts.push(geometry); this.parts.set(material, parts);
  }
  box(material: THREE.Material, size: number[], at: number[], color = '#ffffff', radius = 0, rotation = e()): void {
    const geometry = radius ? new RoundedBoxGeometry(size[0]!, size[1]!, size[2]!, 2, radius) : new THREE.BoxGeometry(size[0]!, size[1]!, size[2]!);
    this.add(geometry, material, v(at[0]!, at[1]!, at[2]!), rotation, color);
  }
  cylinder(material: THREE.Material, radius: number, height: number, at: number[], rotation = e(), color = '#ffffff', sides = 20): void {
    this.add(new THREE.CylinderGeometry(radius, radius, height, sides), material, v(at[0]!, at[1]!, at[2]!), rotation, color);
  }
  label(tile: number, width: number, height: number, at: number[], rotation = e()): void {
    const geometry = new THREE.PlaneGeometry(width, height); geometry.rotateY(Math.PI);
    atlasUv(geometry, tile); this.add(geometry, this.palette.labels, v(at[0]!, at[1]!, at[2]!), rotation);
  }
  source(group: THREE.Group, at: number[], rotation = e(), scale = 1): void {
    const placement = new THREE.Matrix4().compose(v(at[0]!, at[1]!, at[2]!), new THREE.Quaternion().setFromEuler(rotation), v(scale, scale, scale));
    group.updateWorldMatrix(true, true);
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone(); geometry.applyMatrix4(object.matrixWorld).applyMatrix4(placement);
      this.add(geometry, object.material as THREE.Material);
    });
  }
  finish(kind: ShopPropKind): THREE.Group {
    const group = new THREE.Group(); group.name = `SORA ${kind} assembly`;
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
      if (!geometry) throw new Error(`Shop prop material merge failed: ${material.name}`);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = material !== this.palette.glass && material !== this.palette.lamp; mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.shopPropKind = kind; group.userData.sharedShopResources = true; return group;
  }
}

function atlasUv(geometry: THREE.BufferGeometry, tile: number): void {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile % 4 + 0.04 + uv.getX(i) * 0.92) / 4,
    (3 - Math.floor(tile / 4) + 0.04 + uv.getY(i) * 0.92) / 4);
}

function vending(m: Palette): THREE.Group {
  const b = new Batch(m), red = '#a6372e', cream = '#dcd7c8';
  // 0.97 × 1.84 × 0.76 m cabinet. Separate jambs, shelf planes and back wall
  // leave a real 0.19 m deep display rather than a decal on a solid box.
  for (const x of [-0.36, 0.36]) for (const z of [-0.26, 0.26]) b.box(m.dark, [0.10, 0.08, 0.11], [x, 0.04, z]);
  b.box(m.paint, [0.93, 1.70, 0.045], [0, 0.93, 0.347], red, 0.012);
  for (const x of [-0.462, 0.462]) b.box(m.paint, [0.045, 1.72, 0.74], [x, 0.94, 0], red, 0.012);
  b.box(m.paint, [0.97, 0.21, 0.76], [0, 1.735, 0], red, 0.018);
  b.box(m.paint, [0.94, 0.15, 0.73], [0, 0.155, 0], red, 0.012);
  b.box(m.paint, [0.94, 0.51, 0.065], [0, 0.485, -0.327], cream, 0.008);
  b.box(m.dark, [0.73, 0.88, 0.025], [-0.075, 1.17, -0.168]);
  for (const x of [-0.448, 0.298]) b.box(m.paint, [0.036, 0.91, 0.205], [x, 1.17, -0.271], cream);
  b.box(m.paint, [0.142, 0.91, 0.065], [0.384, 1.17, -0.327], cream, 0.009);
  for (const y of [0.725, 1.615]) b.box(m.paint, [0.93, 0.045, 0.215], [0, y, -0.263], cream);
  b.box(m.lamp, [0.84, 0.135, 0.014], [0, 1.735, -0.388]); b.label(0, 0.82, 0.12, [0, 1.735, -0.397]);
  for (const [row, y] of [0.79, 1.205].entries()) {
    b.box(m.metal, [0.69, 0.025, 0.205], [-0.075, y, -0.266]);
    b.box(m.paint, [0.70, 0.08, 0.035], [-0.075, y - 0.036, -0.371], '#375d70');
    for (let column = 0; column < 4; column++) {
      const x = -0.333 + column * 0.172;
      const body = new THREE.LatheGeometry([new THREE.Vector2(0.040, 0), new THREE.Vector2(0.044, 0.006), new THREE.Vector2(0.045, 0.015),
        new THREE.Vector2(0.045, 0.171), new THREE.Vector2(0.041, 0.18)], 24);
      b.add(body, m.paint, v(x, y + 0.018, -0.275), e(), [cream, '#654936', '#ce743e', '#86a9a0'][(column + row) % 4]!);
      const wrap = new THREE.CylinderGeometry(0.0454, 0.0454, 0.133, 24, 1, true); atlasUv(wrap, 2 + (column + row) % 4);
      b.add(wrap, m.labels, v(x, y + 0.102, -0.275));
      b.cylinder(m.metal, 0.041, 0.004, [x, y + 0.201, -0.275]);
      b.add(new THREE.TorusGeometry(0.041, 0.002, 4, 24), m.metal, v(x, y + 0.203, -0.275), e(Math.PI / 2));
      b.box(m.metal, [0.014, 0.002, 0.027], [x, y + 0.206, -0.28], '#ffffff', 0.004);
      b.label(1, 0.122, 0.043, [x, y - 0.041, -0.392]);
      b.cylinder(m.dark, 0.026, 0.013, [x, y - 0.097, -0.379], e(Math.PI / 2));
      b.cylinder(m.paint, 0.021, 0.008, [x, y - 0.097, -0.389], e(Math.PI / 2), '#b8c2b7');
    }
  }
  b.box(m.glass, [0.694, 0.825, 0.006], [-0.075, 1.18, -0.365]);
  // Analog coin entry, return lever and recessed change cup: no modern display.
  b.box(m.metal, [0.106, 0.20, 0.016], [0.38, 1.26, -0.372], '#ffffff', 0.006);
  b.label(7, 0.092, 0.047, [0.38, 1.332, -0.382]);
  b.box(m.dark, [0.034, 0.005, 0.008], [0.377, 1.276, -0.383]);
  b.cylinder(m.metal, 0.028, 0.012, [0.38, 1.21, -0.39], e(Math.PI / 2));
  b.box(m.dark, [0.033, 0.009, 0.025], [0.382, 1.207, -0.40], '#ffffff', 0.003, e(0, 0, -.35));
  b.box(m.dark, [0.096, 0.067, 0.045], [0.382, 0.84, -0.343]);
  b.box(m.metal, [0.10, 0.016, 0.037], [0.382, 0.805, -0.371]); b.label(8, 0.102, 0.032, [0.382, 0.9, -0.366]);
  // Delivery recess is physically open between its surround and angled flap.
  b.box(m.dark, [0.59, 0.175, 0.06], [-0.06, 0.43, -0.362]);
  b.box(m.metal, [0.60, 0.026, 0.085], [-0.06, 0.342, -0.392]);
  for (const x of [-0.365, 0.245]) b.box(m.metal, [0.018, 0.18, 0.045], [x, 0.433, -0.383]);
  b.box(m.paint, [0.56, 0.119, 0.012], [-0.06, 0.468, -0.407], '#777d77', 0.003, e(-0.18));
  b.label(9, 0.25, 0.045, [-0.06, 0.464, -0.416]);
  for (let i = 0; i < 13; i++) b.box(m.dark, [0.38, 0.006, 0.008], [0.06, 0.20 + i * 0.008, -0.374]);
  for (const x of [-0.442, 0.441]) for (const y of [0.26, 0.67, 1.56]) {
    b.cylinder(m.metal, 0.004, 0.002, [x, y, -0.374], e(Math.PI / 2), '#ffffff', 8);
    b.box(m.dark, [0.004, 0.0012, 0.001], [x, y, -0.3755]);
  }
  b.label(15, 0.065, 0.036, [0.389, 0.287, -0.366]);
  const group = b.finish('vending'); group.userData.productCount = 8; group.userData.displayDepthMetres = 0.19; return group;
}

async function sourceAsset(id: string): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(`${root()}${id}/${id}_1k.gltf`);
  gltf.scene.updateMatrixWorld(true); const result = new THREE.Group();
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) throw new Error(`Expected single-material source primitive: ${id}`);
    const material = object.material as THREE.MeshStandardMaterial;
    material.aoMap = material.metalnessMap; material.aoMapIntensity = 0.85;
    for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) if (texture) texture.anisotropy = 8;
    const geometry = object.geometry.clone();
    if (object instanceof THREE.SkinnedMesh) {
      object.skeleton.update(); const position = geometry.getAttribute('position'), point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) { object.getVertexPosition(i, point); position.setXYZ(i, point.x, point.y, point.z); }
      geometry.computeVertexNormals();
    }
    geometry.applyMatrix4(object.matrixWorld);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `${id} ${object.name}`; result.add(mesh);
  });
  result.name = id; return result;
}

function workshop(m: Palette, source: Record<string, THREE.Group>): THREE.Group {
  const b = new Batch(m), red = '#a33e31', frame = '#435456', tabletop = 0.91, centerX = -0.25;
  // 1.46 m bench plus a 0.6 m tyre stack, all behind a 0.9 m deep threshold.
  b.box(m.wood, [1.50, 0.066, 0.63], [centerX, tabletop - 0.033, 0], '#ffffff', 0.008);
  for (const x of [-0.925, 0.425]) for (const z of [-0.245, 0.245]) {
    b.box(m.paint, [0.046, 0.85, 0.046], [x, 0.435, z], frame);
    b.box(m.dark, [0.062, 0.02, 0.066], [x, 0.01, z]);
  }
  for (const z of [-0.246, 0.246]) b.box(m.paint, [1.40, 0.058, 0.039], [centerX, 0.82, z], frame);
  b.box(m.wood, [1.38, 0.033, 0.49], [centerX, 0.22, 0.03]);
  b.box(m.paint, [1.43, 0.056, 0.039], [centerX, 0.255, 0.274], frame);
  for (const x of [-0.925, 0.425]) b.box(m.paint, [0.036, 1.02, 0.032], [x, 1.31, 0.324], frame);
  b.box(m.paint, [1.43, 0.033, 0.032], [centerX, 1.812, 0.324], frame);
  // A perforated, extruded pegboard, with real through-holes and standoffs.
  const shape = new THREE.Shape().moveTo(-0.71, -0.40).lineTo(0.71, -0.40).lineTo(0.71, 0.40).lineTo(-0.71, 0.40).closePath();
  for (let x = -.64; x < .68; x += .08) for (let y = -.33; y < .36; y += .07) {
    const hole = new THREE.Path(); hole.absarc(x, y, 0.007, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.023, bevelEnabled: false, curveSegments: 2 }), m.wood, v(centerX, 1.4, 0.305));
  for (const x of [-0.92, 0.42]) for (const y of [1.04, 1.76]) b.cylinder(m.metal, 0.009, 0.008, [x, y, 0.299], e(Math.PI / 2));
  b.label(10, 0.27, 0.12, [-0.67, 1.70, 0.299]);
  for (let i = 0; i < 5; i++) {
    const x = -.83 + i * .18, scale = .68 + i * .07;
    b.source(source.combination_wrench!, [x, 1.39, .291], e(-Math.PI / 2, 0, (i - 2) * .015), scale);
    b.cylinder(m.metal, .0035, .048, [x, 1.54, .291], e(Math.PI / 2), '#ffffff', 8);
  }
  for (let i = 0; i < 3; i++) {
    const x = .16 + i * .10;
    b.cylinder(m.paint, .013, .070, [x, 1.285, .269], e(), i === 1 ? '#485a58' : red, 12);
    b.cylinder(m.metal, .0032, .13, [x, 1.38, .269], e(), '#ffffff', 8);
    b.box(m.metal, [.006, .018, .002], [x, 1.452, .269]);
  }
  // Source vice stays at its authored frame origin so the handle hangs below
  // the tabletop. Its +Z handle is turned toward the -Z frontage.
  b.source(source.bench_vice_01!, [-.75, tabletop - .00004146, -.185], e(0, Math.PI));
  b.source(source.small_oil_can_01!, [.25, tabletop, .08], e(0, -.22));
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Shape(); ring.absarc(0, 0, .011 + i * .001, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, .006 + i * .0006, 0, Math.PI * 2, true); ring.holes.push(hole);
    b.add(new THREE.ExtrudeGeometry(ring, { depth: .022, bevelEnabled: false, curveSegments: 3 }), m.metal,
      v(-.18 + i * .044, tabletop + .022, -.225), e(Math.PI / 2));
  }
  // Four distinct drawers, recessed reveals, pulls and rubber castors.
  b.box(m.paint, [.49, .59, .47], [.16, .44, -.01], red, .007);
  for (let drawer = 0; drawer < 4; drawer++) {
    const y = .235 + drawer * .127;
    b.box(m.dark, [.46, .116, .010], [.16, y, -.251]);
    b.box(m.paint, [.445, .104, .014], [.16, y, -.259], drawer % 2 ? '#96392e' : red, .003);
    b.box(m.metal, [.32, .016, .024], [.16, y + .028, -.281], '#ffffff', .004);
  }
  for (const x of [-.02, .34]) for (const z of [-.15, .13]) {
    b.cylinder(m.dark, .043, .030, [x, .047, z], e(0, 0, Math.PI / 2), '#ffffff', 12);
    b.box(m.metal, [.025, .049, .035], [x, .112, z]);
  }
  // Open slatted parts crate beneath the left half of the bench.
  for (const x of [-.86, -.46]) for (const z of [-.18, .22]) b.box(m.wood, [.032, .30, .032], [x, .385, z]);
  for (let slat = 0; slat < 3; slat++) for (const z of [-.195, .235]) b.box(m.wood, [.46, .070, .026], [-.66, .275 + slat * .105, z]);
  for (let slat = 0; slat < 3; slat++) for (const x of [-.88, -.44]) b.box(m.wood, [.023, .070, .44], [x, .275 + slat * .105, .02]);
  b.label(14, .15, .055, [-.66, .375, -.21]);
  for (let i = 0; i < 3; i++) {
    const x = -.81 + i * .15;
    b.box(m.paint, [.103, .24, .12], [x, .3625, .005], i === 1 ? '#927743' : '#5c7371', .009);
    b.cylinder(m.dark, .022, .018, [x, .4945, .005], e(), '#ffffff', 12); b.label(11, .09, .12, [x, .3655, -.058]);
  }
  for (let i = 0; i < 3; i++) b.source(source.old_tyre!, [.91 + (i === 1 ? -.025 : 0), .083 + i * .168, .02], e(Math.PI / 2, 0, i * .62));
  const group = b.finish('workshop'); group.userData.tabletopHeightMetres = tabletop; group.userData.tyreCount = 3; return group;
}

function statistics(group: THREE.Group): ShopPropStats {
  let meshes = 0, triangles = 0;
  group.traverse(object => { if (object instanceof THREE.Mesh) { meshes++; triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3; } });
  const bounds = new THREE.Box3().setFromObject(group); return { meshes, triangles, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() } };
}

let pending: Promise<ShopPropLibrary> | undefined;
/** Shared original furniture + verified CC0 tools/tyres. No application or physics changes. */
export function loadShopProps(): Promise<ShopPropLibrary> {
  return pending ??= (async () => {
    const m = createPalette(), ids = ['old_tyre', 'bench_vice_01', 'combination_wrench', 'small_oil_can_01'];
    const assets: Record<string, THREE.Group> = Object.fromEntries(await Promise.all(ids.map(async id => [id, await sourceAsset(id)] as const)));
    const templates = { vending: vending(m), workshop: workshop(m, assets) };
    // The final merged meshes retain source textures; temporary baked geometry
    // can be released after assembly without touching shared materials.
    Object.values(assets).forEach(group => group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }));
    return { create: kind => templates[kind].clone(true), stats: { vending: statistics(templates.vending), workshop: statistics(templates.workshop) } };
  })();
}
