import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scannedSurface, scannedSurfacesReady } from './surfaces';

const WHITE = '#eee4cc', INK = '#283b45', RED = '#9e433b', MINT = '#738a78';
type Palette = ReturnType<typeof palette>;
const pending: Promise<unknown>[] = [];
const templates = new WeakMap<THREE.Texture, Map<string, THREE.Group>>();
let shared: Palette | undefined;
/** Per-mood shopfront glow (setShopfrontGlow), applied when the palette is created too. */
const glow = { diffuser: 1, signage: 0 };
const point = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function wovenNormal(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 16, v = y / size * Math.PI * 16;
    const nx = Math.cos(u) * .24 * (1 + Math.sin(v) * .23), ny = Math.cos(v) * .19 * (1 - Math.sin(u) * .23);
    const n = point(nx, ny, 1).normalize(), i = (y * size + x) * 4;
    data[i] = Math.round((n.x * .5 + .5) * 255); data[i + 1] = Math.round((n.y * .5 + .5) * 255);
    data[i + 2] = Math.round((n.z * .5 + .5) * 255); data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size); texture.name = 'Fine interlaced awning thread normals';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(128, 32);
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8; texture.needsUpdate = true; return texture;
}

function typography(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const context = canvas.getContext('2d')!;
  const labels = [
    { text: '走る仲間', sub: 'SORA MOTOR CLUB', ink: WHITE, bg: INK, aspect: .42 },
    { text: '珈琲', sub: '夕凪', ink: WHITE, bg: RED, aspect: .52 },
    { text: '森田商店', sub: '毎日のくらしに', ink: INK, bg: WHITE, aspect: .45 },
    { text: 'ラジオ', sub: '朝日 電器', ink: WHITE, bg: INK, aspect: .5 },
    { text: '喫茶 夕凪', sub: 'COFFEE  &  TEA', ink: RED, bg: WHITE, aspect: 3.7 },
    { text: '本日のおしながき', sub: '珈琲  250円    紅茶  250円', ink: WHITE, bg: '#37463c', aspect: 1.22 },
    { text: '森田商店', sub: '野菜・果物・日用品', ink: INK, bg: WHITE, aspect: 4.2 },
    { text: '朝日 電器', sub: 'ラジオ・テレビ・修理', ink: WHITE, bg: '#6b5142', aspect: 4.2 },
    { text: 'MOTOR OIL', sub: 'SAE 10W–30', ink: WHITE, bg: RED, aspect: 1 },
    { text: 'SORA', sub: 'SERVICE MANUAL  1986', ink: INK, bg: WHITE, aspect: .76 },
    { text: '旬のやさい', sub: '100円  より', ink: INK, bg: '#e7d9b8', aspect: 2.1 },
    { text: 'FM STEREO', sub: '76  80  84  88  90', ink: '#dcc99d', bg: '#26332f', aspect: 5.2 },
    { text: '珈琲豆', sub: '自家焙煎', ink: WHITE, bg: '#694936', aspect: .72 },
    { text: '牛乳', sub: 'まいにち、新鮮', ink: INK, bg: WHITE, aspect: .76 },
    { text: '音でつながる', sub: 'この街で。', ink: INK, bg: WHITE, aspect: .62 },
    { text: '整備・点検', sub: 'よい道を、またどこかで', ink: WHITE, bg: RED, aspect: 4.1 },
  ];
  const draw = () => labels.forEach((label, tile) => {
    const plate = document.createElement('canvas'); plate.width = 768; plate.height = Math.round(768 / label.aspect);
    const ctx = plate.getContext('2d')!, w = plate.width, h = plate.height;
    ctx.fillStyle = label.bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = label.ink; ctx.lineWidth = Math.max(2, w * .008);
    ctx.strokeRect(w * .055, h * .036, w * .89, h * .928); ctx.fillStyle = label.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (label.aspect < .65) {
      const characters = [...label.text], top = h * .15, interval = h * .61 / characters.length;
      ctx.font = `600 ${Math.min(w * .58, interval * .8)}px "Hiragino Mincho ProN", SoraJP, serif`;
      characters.forEach((c, i) => ctx.fillText(c, w * .5, top + interval * (i + .5)));
      ctx.font = `600 ${w * .105}px SoraJP, sans-serif`; ctx.fillText(label.sub, w / 2, h * .88, w * .8);
    } else {
      ctx.font = `600 ${Math.min(h * .38, w * .17)}px "Hiragino Mincho ProN", SoraJP, serif`; ctx.fillText(label.text, w / 2, h * .41, w * .84);
      ctx.font = `500 ${Math.min(h * .15, w * .068)}px SoraJP, sans-serif`; ctx.fillText(label.sub, w / 2, h * .74, w * .85);
    }
    context.drawImage(plate, tile % 4 * 512, Math.floor(tile / 4) * 512, 512, 512);
  });
  draw();
  const texture = new THREE.CanvasTexture(canvas); texture.name = 'Original 1986 neighborhood shop cloth and printed labels';
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  pending.push(document.fonts.load('600 44px SoraJP', labels.map(l => l.text + l.sub).join('')).catch(() => [])
    .then(() => document.fonts.ready).then(() => { draw(); texture.needsUpdate = true; }));
  return texture;
}
function palette() {
  const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .64, metalness: .08, clearcoat: .13, clearcoatRoughness: .5 });
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, ...scannedSurface('japanese_cedar_planks'), roughness: .82, normalScale: new THREE.Vector2(.28, .28) });
  const cloth = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .97,
    normalMap: wovenNormal(), normalScale: new THREE.Vector2(.36, .36), sheen: .3, sheenRoughness: .9, sheenColor: new THREE.Color('#d0c6ad') });
  const print = typography();
  // Backlit at night (setShopfrontGlow): the emissive map is the print itself.
  const labels = new THREE.MeshStandardMaterial({ map: print, roughness: .9, side: THREE.DoubleSide,
    emissiveMap: print, emissive: '#ffffff', emissiveIntensity: glow.signage });
  const warm = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#ffc070', emissiveIntensity: .36 * glow.diffuser, roughness: .7 });
  paint.name = 'Shopfront painted enamel and patinated fittings'; wood.name = 'Shopfront scanned cedar'; cloth.name = 'Shopfront woven canvas';
  labels.name = 'Original shopfront typography'; warm.name = 'Shopfront warm diffusers and display backs';
  return { paint, wood, cloth, labels, warm };
}
function atlas(geometry: THREE.BufferGeometry, tile: number): void {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile % 4 + .025 + uv.getX(i) * .95) / 4,
    (3 - Math.floor(tile / 4) + .025 + uv.getY(i) * .95) / 4);
}
class Batch {
  readonly pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(readonly m: Palette) {}
  add(g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, color = '#ffffff', rotation = new THREE.Euler()): void {
    const geometry = g.index ? g.toNonIndexed() : g; if (geometry !== g) g.dispose();
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation)); geometry.translate(x, y, z);
    for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(attribute)) geometry.deleteAttribute(attribute);
    const p = geometry.getAttribute('position');
    if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
    if (!geometry.hasAttribute('color')) {
      const colors = new Float32Array(p.count * 3), rgb = new THREE.Color(color);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    if (material === this.m.wood) {
      const uv = geometry.getAttribute('uv'), n = geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getX(i)) > Math.abs(n.getZ(i)) ? p.getZ(i) : p.getX(i)) / 1.1,
        (Math.abs(n.getY(i)) > .6 ? p.getZ(i) : p.getY(i)) / 1.1);
    }
    const pieces = this.pieces.get(material) ?? []; pieces.push(geometry); this.pieces.set(material, pieces);
  }
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, color = '#ffffff', rounded = .009): void {
    this.add(rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(rounded, w / 4, h / 4, d / 4)) : new THREE.BoxGeometry(w, h, d), material, x, y, z, color);
  }
  rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, color = '#67706a'): void {
    const delta = b.clone().sub(a), geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(point(0, 1, 0), delta.normalize()));
    const center = a.clone().add(b).multiplyScalar(.5); this.add(geometry, this.m.paint, center.x, center.y, center.z, color);
  }
  label(tile: number, w: number, h: number, x: number, y: number, z: number, turn = 0): void {
    const geometry = new THREE.PlaneGeometry(w, h); geometry.rotateY(Math.PI); atlas(geometry, tile);
    this.add(geometry, this.m.labels, x, y, z, '#ffffff', new THREE.Euler(0, turn, 0));
  }
  finish(variant: number): THREE.Group {
    const group = new THREE.Group(); group.name = `SORA complete shopfront ${variant}`;
    let triangles = 0;
    for (const [material, parts] of this.pieces) {
      const geometry = mergeGeometries(parts); if (!geometry) throw new Error(`Cannot merge shopfront ${variant}.`);
      parts.forEach(g => g.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); triangles += geometry.getAttribute('position').count / 3;
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `${group.name}: ${material.name}`;
      mesh.castShadow = material !== this.m.warm; mesh.receiveShadow = true; group.add(mesh);
    }
    group.userData.shopfront = { variant, triangles, meshBatches: group.children.length, sharedResources: true };
    return group;
  }
}

function curvedPanel(w: number, h: number, transform: (x: number, y: number) => THREE.Vector3, columns = 32, rows = 8): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    positions.push(...transform((c / columns - .5) * w, r / rows * h).toArray()); uv.push(c / columns, r / rows);
    if (r < rows && c < columns) { const a = r * (columns + 1) + c, b = a + columns + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
function awning(b: Batch, x: number, front: number, width: number, variant: number): void {
  const accent = [INK, RED, MINT, '#666e79'][variant]!, stripeCount = variant === 3 ? 10 : 12;
  // The upper cloth clears the old structural canopy, which becomes its solid
  // support. A curved front hem and independently folded valance change the silhouette.
  for (let stripe = 0; stripe < stripeCount; stripe++) {
    const offset = ((stripe + .5) / stripeCount - .5) * width;
    const cloth = curvedPanel(width / stripeCount, 1, (u, t) => point(u + offset,
      3.29 - .19 * t - .025 * Math.sin(t * Math.PI), front - .2 - .9 * t), 4, 8);
    const uv = cloth.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, (stripe + uv.getX(i)) / stripeCount);
    b.add(cloth, b.m.cloth, x, 0, 0, stripe % 3 === 0 ? WHITE : accent);
  }
  const valance = curvedPanel(width, .28, (u, t) => point(u, 3.1 - t - .035 * Math.pow(Math.sin((u / width + .5) * Math.PI * stripeCount), 2),
    front - 1.112 - .012 * Math.sin(u * 11) * Math.sin(t / .28 * Math.PI)), 48, 6);
  b.add(valance, b.m.cloth, x, 0, 0, accent);
  for (const sign of [-1, 1]) {
    b.rod(point(x + sign * width / 2, 3.22, front - .16), point(x + sign * width / 2, 3.06, front - 1.09), .018, '#7c7769');
    b.rod(point(x + sign * width / 2, 2.59, front - .06), point(x + sign * width / 2, 3.06, front - 1.09), .013, '#7c7769');
  }
  b.rod(point(x - width / 2, 3.09, front - 1.1), point(x + width / 2, 3.09, front - 1.1), .015, accent);
}
function hangingCloth(b: Batch, tile: number, x: number, front: number, width: number, height: number, top: number): void {
  b.rod(point(x - width / 2 - .07, top + .045, front - .2), point(x + width / 2 + .07, top + .045, front - .2), .018);
  for (const side of [-1, 1]) b.rod(point(x + side * width * .36, top + .03, front + .02), point(x + side * width * .36, top + .03, front - .2), .011);
  const cloth = curvedPanel(width, height, (u, v) => point(u, top - height + v,
    front - .225 - .022 * Math.sin(u / width * Math.PI * 4 + v * 1.4) * (1 - v / height)), 16, 28);
  atlas(cloth, tile); b.add(cloth, b.m.labels, x);
  // Folded side seams retain dimensional edges instead of a flat poster quad.
  for (const side of [-1, 1]) b.rod(point(x + side * width / 2, top, front - .226), point(x + side * width / 2, top - height, front - .222), .0032, '#b1a38b');
}
function pendant(b: Batch, x: number, z: number, top: number): void {
  b.rod(point(x, top + .35, z), point(x, top + .1, z), .012, INK);
  const shade = new THREE.LatheGeometry([[.015, .17], [.07, .145], [.15, .085], [.225, .016], [.228, 0], [.216, -.007], [.146, .073], [.06, .129], [.015, .15]].map(([r, y]) => new THREE.Vector2(r!, y!)), 36);
  b.add(shade, b.m.paint, x, top, z, INK);
  const diffuser = new THREE.CircleGeometry(.191, 32); diffuser.rotateX(Math.PI / 2); b.add(diffuser, b.m.warm, x, top + .014, z, '#f3d7a2');
  b.add(new THREE.SphereGeometry(.045, 16, 10), b.m.warm, x, top + .035, z, '#f3dfa9');
}
function counterStrip(b: Batch, x: number, front: number): void {
  // Project a real twin-tube fluorescent fitting ahead of the counter. A
  // fixture behind the CRT/counter faces cannot light their forward normals,
  // even when its spot is aimed correctly. Header arms make this mount visible.
  const z = front - .92;
  b.box(b.m.paint, 1.92, .075, .23, x, 2.913, z, '#d0c6af', .014);
  b.box(b.m.paint, 1.83, .018, .2, x, 2.867, z, WHITE, .004);
  for (const side of [-1, 1]) {
    b.rod(point(x + side * .72, 2.94, front - .07), point(x + side * .72, 2.94, z), .014, INK);
    b.box(b.m.paint, .075, .16, .052, x + side * .72, 2.913, front - .067, '#74746a', .006);
  }
  for (const offset of [-.055, .055]) {
    b.add(new THREE.CylinderGeometry(.014, .014, 1.72, 16), b.m.warm,
      x, 2.842, z + offset, '#f6dfad', new THREE.Euler(0, 0, Math.PI / 2));
    for (const side of [-1, 1]) {
      b.box(b.m.paint, .038, .064, .045, x + side * .876, 2.853, z + offset, '#d5cdbb', .005);
      b.add(new THREE.CylinderGeometry(.015, .015, .038, 12), b.m.paint,
        x + side * .858, 2.842, z + offset, '#a7a79b', new THREE.Euler(0, 0, Math.PI / 2));
    }
  }
}
function windowDisplay(b: Batch, x: number, front: number, variant: number): void {
  // Fits inside the existing 1.6 × 1.52 m glazed opening and in front of its
  // curtain/room back. Merchandise is genuine depth behind the original glass.
  b.box(b.m.warm, 1.38, 1.3, .025, x, 1.66, front + .25, '#63523d');
  for (const y of [1.02, 1.62, 2.22]) b.box(b.m.wood, 1.4, .055, .22, x, y, front + .12, '#e5d3ac');
  b.box(b.m.warm, 1.29, .025, .06, x, 2.28, front + .065, '#f7dfa9');
  if (variant === 0) {
    for (let i = 0; i < 5; i++) {
      const height = .28 + i % 2 * .07, center = 1.6485 + height / 2;
      b.box(b.m.paint, .13, height, .115, x - .52 + i * .23, center, front + .12, i % 2 ? RED : WHITE);
      b.label(8, .103, .155, x - .52 + i * .23, center, front + .054);
    }
    for (let i = 0; i < 4; i++) {
      b.box(b.m.paint, .23, .32, .07, x - .46 + i * .3, 1.21, front + .1, WHITE);
      b.label(9, .2, .28, x - .46 + i * .3, 1.21, front + .058);
    }
  } else if (variant === 1) {
    for (let i = 0; i < 4; i++) cup(b, x - .48 + i * .31, 1.654, front + .12, .8);
    for (let i = 0; i < 4; i++) {
      b.box(b.m.paint, .23, .36, .105, x - .48 + i * .31, 1.23, front + .115, '#956e49');
      b.label(12, .17, .235, x - .48 + i * .31, 1.23, front + .057);
    }
  } else if (variant === 2) {
    for (let i = 0; i < 6; i++) bottle(b, x - .55 + i * .22, 1.65, front + .12, .63);
    for (let i = 0; i < 4; i++) {
      b.box(b.m.paint, .22, .32, .1, x - .48 + i * .3, 1.21, front + .12, [WHITE, MINT, '#b69564', '#ae664b'][i]!);
      b.label(13, .14, .18, x - .48 + i * .3, 1.21, front + .064);
    }
  } else {
    for (let i = 0; i < 3; i++) radio(b, x - .46 + i * .46, 1.649, front + .09, .58);
    for (let i = 0; i < 8; i++) {
      b.box(b.m.paint, .12, .2, .07, x - .56 + i * .16, 1.15, front + .12, i % 3 ? WHITE : RED);
      b.box(b.m.paint, .085, .075, .01, x - .56 + i * .16, 1.15, front + .079, INK);
    }
  }
}
function cup(b: Batch, x: number, y: number, z: number, scale = 1): void {
  const lathe = new THREE.LatheGeometry([[.046, 0], [.052, .009], [.067, .097], [.065, .11], [.057, .111], [.055, .097], [.039, .013], [.046, 0]].map(([r, h]) => new THREE.Vector2(r! * scale, h! * scale)), 24);
  b.add(lathe, b.m.paint, x, y, z, WHITE);
  b.add(new THREE.TorusGeometry(.045 * scale, .01 * scale, 7, 20, Math.PI * 1.45), b.m.paint, x + .075 * scale, y + .06 * scale, z, WHITE, new THREE.Euler(0, 0, -.7));
  b.add(new THREE.CylinderGeometry(.088 * scale, .068 * scale, .013 * scale, 24), b.m.paint, x, y, z, WHITE);
}
function bottle(b: Batch, x: number, y: number, z: number, scale = 1): void {
  const geometry = new THREE.LatheGeometry([[.06, 0], [.069, .018], [.07, .24], [.061, .28], [.03, .318], [.028, .37], [.036, .375], [.036, .385], [.025, .39], [0, .39]].map(([r, h]) => new THREE.Vector2(r! * scale, h! * scale)), 24);
  b.add(geometry, b.m.paint, x, y, z, WHITE);
  b.box(b.m.paint, .05 * scale, .012 * scale, .05 * scale, x, y + .392 * scale, z, '#b4855d');
}
function radio(b: Batch, x: number, y: number, z: number, scale = 1): void {
  const w = .54 * scale, h = .27 * scale, d = .14 * scale;
  b.box(b.m.paint, w, h, d, x, y + h / 2, z, '#bdb4a0', .022 * scale);
  b.box(b.m.paint, w - .035 * scale, h - .026 * scale, .022 * scale, x, y + h / 2, z - d / 2, INK);
  for (let line = 0; line < 11; line++) b.box(b.m.paint, .235 * scale, .008 * scale, .01 * scale, x - .105 * scale,
    y + (.055 + line * .015) * scale, z - d / 2 - .016 * scale, '#8e9083', 0);
  b.label(11, .19 * scale, .035 * scale, x + .143 * scale, y + .193 * scale, z - d / 2 - .016 * scale);
  for (const offset of [-.038, .045]) b.add(new THREE.CylinderGeometry(.024 * scale, .025 * scale, .024 * scale, 20), b.m.paint,
    x + (.14 + offset) * scale, y + .073 * scale, z - d / 2 - .022 * scale, '#b8b4a6', new THREE.Euler(Math.PI / 2));
  for (const side of [-1, 1]) b.rod(point(x + side * w * .32, y + h, z), point(x + side * w * .32, y + h + .052 * scale, z), .008 * scale, INK);
  b.rod(point(x - w * .32, y + h + .052 * scale, z), point(x + w * .32, y + h + .052 * scale, z), .013 * scale, INK);
}
function television(b: Batch, x: number, y: number, z: number): void {
  b.box(b.m.wood, .82, .66, .4, x, y + .33, z, '#b7956d', .034);
  b.box(b.m.paint, .77, .59, .065, x, y + .34, z - .206, '#3d433f', .024);
  const screen = curvedPanel(.52, .405, (u, v) => point(u, v - .2025, .014 * (1 - (u / .26) ** 2) * Math.sin(v / .405 * Math.PI)), 20, 14);
  b.add(screen, b.m.paint, x - .055, y + .35, z - .245, '#667771', new THREE.Euler(0, Math.PI, 0));
  for (const h of [.23, .47]) b.add(new THREE.CylinderGeometry(.038, .038, .035, 20), b.m.paint,
    x + .298, y + h, z - .252, '#b5b5a4', new THREE.Euler(Math.PI / 2));
  for (let i = 0; i < 8; i++) b.box(b.m.paint, .064, .008, .01, x + .295, y + .31 + i * .013, z - .246, '#a4a598', 0);
  for (const side of [-1, 1]) b.box(b.m.paint, .09, .055, .29, x + side * .25, y - .012, z, INK);
}
function counter(b: Batch, x: number, front: number, variant: number): void {
  const width = 2.68, z = front - .4;
  // A cohesive shop-sized display replaces a blank shutter silhouette while
  // staying shallow enough to leave the street and the adjacent door clear.
  for (const side of [-1, 1]) b.box(b.m.wood, .09, .78, .54, x + side * 1.24, .75, z, '#c1a27a');
  for (const y of [.42, 1.16]) b.box(b.m.wood, width, .095, .62, x, y, z, '#d3b68d');
  b.box(b.m.wood, width, .65, .065, x, .8, z + .275, '#b29671');
  for (let slat = 0; slat < 18; slat++) b.box(b.m.wood, .12, .6, .035, x - 1.235 + slat * .145, .78, z - .278, '#ccb18a', .003);
  b.box(b.m.paint, width + .02, .045, .065, x, 1.205, z - .292, variant === 1 ? RED : variant === 2 ? MINT : INK);
  if (variant === 1) {
    for (let i = 0; i < 5; i++) cup(b, x - .99 + i * .245, 1.215, z - .08);
    const urn = new THREE.LatheGeometry([[.13, 0], [.16, .03], [.16, .44], [.145, .5], [.05, .53], [0, .54]].map(([r, y]) => new THREE.Vector2(r!, y!)), 36);
    b.add(urn, b.m.paint, x + .72, 1.21, z + .045, '#b4ac96');
    b.box(b.m.paint, .28, .095, .025, x + .72, 1.49, z - .116, INK);
    b.rod(point(x + .72, 1.35, z - .115), point(x + .72, 1.35, z - .22), .016, '#b4ac96');
    b.box(b.m.wood, .7, .65, .06, x - .77, 1.535, z + .2, '#978460');
    b.label(5, .62, .57, x - .77, 1.535, z + .163);
    b.label(4, 1.95, .45, x, .77, z - .303);
    pendant(b, x - .68, front - .52, 2.61); pendant(b, x + .68, front - .52, 2.61);
  } else if (variant === 2) {
    for (const [i, offset] of [-.88, 0, .88].entries()) {
      b.box(b.m.wood, .8, .055, .47, x + offset, 1.2275, z, '#c7a779');
      for (const side of [-1, 1]) b.box(b.m.wood, .055, .28, .47, x + offset + side * .395, 1.35, z, '#d1b38a');
      for (const sign of [-1, 1]) for (const h of [1.25, 1.4]) b.box(b.m.wood, .8, .085, .035, x + offset, h, z + sign * .23, '#d7b98d', .005);
      for (let item = 0; item < 7; item++) {
        const px = x + offset - .25 + item % 3 * .24, pz = z - .12 + Math.floor(item / 3) * .12;
        if (i === 0) { const fruit = new THREE.SphereGeometry(.082, 16, 12); fruit.scale(1, .87, .96); b.add(fruit, b.m.paint, px, 1.328 + (item === 6 ? .12 : 0), pz, item % 2 ? '#b99a49' : '#b97749'); }
        else if (i === 1) { const vegetable = new THREE.LatheGeometry([[0, 0], [.045, .018], [.057, .12], [.04, .185], [.013, .205]].map(([r, h]) => new THREE.Vector2(r!, h!)), 16);
          b.add(vegetable, b.m.paint, px, 1.27, pz, '#777845', new THREE.Euler(.32, 0, .3)); }
        else bottle(b, px, 1.25, pz, .64);
      }
    }
    b.label(10, .64, .26, x, 1.08, z - .319); b.label(6, 1.95, .45, x, .77, z - .303);
  } else {
    television(b, x - .75, 1.24, z + .015);
    television(b, x + .2, 1.24, z + .015);
    radio(b, x + .91, 1.209, z - .07, .64);
    b.box(b.m.wood, width - .08, .07, .32, x, 2.12, z + .08, '#bc9e75');
    for (let i = 0; i < 4; i++) radio(b, x - 1 + i * .64, 2.156, z + .11, .92);
    b.label(7, 1.95, .45, x, .77, z - .303);
  }
}

function build(variant: number, width: number, front: number, flag: THREE.Texture): THREE.Group {
  const m = shared ??= palette(), b = new Batch(m), garageX = -width * .24, cafeX = width * .25;
  awning(b, cafeX, front, width * .45, variant);
  windowDisplay(b, cafeX + .38, front, variant);
  const openingRight = garageX + 1.62, entryLeft = cafeX - 1.05 - .425;
  const bannerX = (openingRight + entryLeft) / 2;
  hangingCloth(b, variant, bannerX, front, Math.min(.52, entryLeft - openingRight - .14), variant === 0 ? 1.68 : 1.32, 2.94);
  if (variant === 0) {
    // The workshop stays physically open: only its overhead fascia is added.
    b.box(m.paint, 3.12, .2, .065, garageX, 2.91, front - .14, RED);
    b.label(15, 2.95, .17, garageX, 2.91, front - .178);
    const badgeMaterial = new THREE.MeshStandardMaterial({ map: flag, roughness: .95, side: THREE.DoubleSide });
    badgeMaterial.name = 'SORA cloth badge';
    const badge = curvedPanel(.31, .2, (x, y) => point(x, y, -.008 * Math.sin(x * 15)), 12, 6);
    badge.rotateY(Math.PI); b.add(badge, badgeMaterial, bannerX, 1.35, front - .257);
  } else {
    counter(b, garageX, front, variant);
    counterStrip(b, garageX, front);
  }
  const group = b.finish(variant);
  group.userData.shopfront = { ...group.userData.shopfront, identity: ['SORA motor shop', 'Yunagi coffee shop', 'Morita grocer', 'Asahi radio and electrical'][variant],
    clearDoor: { minX: entryLeft, maxX: cafeX - 1.05 + .425, top: 2.4 },
    clearGarage: variant === 0 ? { minX: garageX - 1.5, maxX: garageX + 1.5, top: 2.7 } : null };
  return group;
}

/** Attach after the architecture visibility bake has finished. Completed
 * architectural meshes remain byte-identical; clones share this additive
 * shopfront's merged geometry and materials. Caller owns root lifetime. */
export function attachShopfront(root: THREE.Group, variant: number, flag: THREE.Texture): void {
  variant = Math.abs(Math.floor(variant)) % 4;
  const front = Number(root.userData.front), garageX = Number(root.userData.flagPosition?.[0]);
  const width = -garageX / .24;
  if (!Number.isFinite(front) || !Number.isFinite(width) || width < 6 || width > 12) throw new Error('Shopfront requires the completed SORA house metadata.');
  if (variant > 0) {
    // The emitter is just below the actual projecting tubes. Root assigns an
    // existing bounded spot; original doorway/open-garage anchors stay intact.
    root.userData.shopfrontLightPosition = [garageX, 2.819, front - .92];
    root.userData.shopfrontLightTarget = [garageX, 1.5, front - .35];
  }
  if (root.children.some(child => child.userData.shopfront)) return;
  let library = templates.get(flag); if (!library) { library = new Map(); templates.set(flag, library); }
  const key = `${variant}:${width}:${front}`;
  let template = library.get(key); if (!template) { template = build(variant, width, front, flag); library.set(key, template); }
  root.add(template.clone(true));
}

/** All locally requested scan maps and final Japanese typography are present
 * before the scene's existing presentation-readiness gate is released. */
export async function shopfrontReady(): Promise<void> { await Promise.all([...pending, scannedSurfacesReady()]); }

/** Warm diffusers and display backs (emissive .36 at gain 1) and the printed
 * signage's backlight (0 at gain 0), per race mood (R3 night value): brighter
 * lit shopfronts at night, as the cutscenes' storefronts. */
export function setShopfrontGlow(diffuserGain: number, signage: number): void {
  glow.diffuser = Math.max(0, diffuserGain); glow.signage = Math.max(0, signage);
  if (!shared) return;
  shared.warm.emissiveIntensity = .36 * glow.diffuser;
  shared.labels.emissiveIntensity = glow.signage;
}
