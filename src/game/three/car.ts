import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface CarModel {
  group: THREE.Group;
  setAppearance(color: string, accent?: string, aero?: boolean): void;
  setOpacity(value: number): void;
  animate(speedMetersPerSecond: number, steerRadians: number, braking: boolean, boosting: boolean, time: number): void;
  /** Hide panels that have broken off (CAR_PARTS bit mask, src/game/drive/damage.ts). */
  setDamage?(detached: number): void;
  /** The panel `bit` as a standalone piece in car space, positioned at its centre, to throw down the road. */
  breakPart?(bit: number): { object: THREE.Object3D; size: number } | null;
  /** Release this car's own materials (shared geometry stays): a car built for one race, replaced by the next. */
  dispose?(): void;
}

type Paint = 'paint' | 'shade' | 'accent' | 'rubber' | 'black' | 'alloy' | 'chrome'
  | 'glass' | 'red' | 'amber' | 'headlamp' | 'reverse' | 'plate' | 'seats' | 'instrument';
type Parts = Partial<Record<Paint, THREE.BufferGeometry[]>>;
type Assembly = Partial<Record<Paint, THREE.BufferGeometry>>;
type Point = readonly [number, number, number];
interface GeometryLibrary { body: Assembly; wheel: Assembly; aero: Assembly; flame: THREE.BufferGeometry }
let geometryLibrary: GeometryLibrary | undefined;
let textures: { brush: THREE.CanvasTexture; pigment: THREE.CanvasTexture; rubber: THREE.CanvasTexture; glass: THREE.CanvasTexture;
  lens: THREE.CanvasTexture; plate: THREE.CanvasTexture } | undefined;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const screenDoorShader = /* glsl */ `
uniform float uSoraModelOpacity;
float soraCarBayer2(vec2 point) {
  vec2 cell = mod(point, 2.0);
  return 2.0 * cell.x + 3.0 * cell.y - 4.0 * cell.x * cell.y;
}
float soraCarThreshold(vec2 point) {
  vec2 cell = mod(floor(point), 4.0);
  return (4.0 * soraCarBayer2(cell) + soraCarBayer2(floor(cell * 0.5)) + 0.5) / 16.0;
}
`;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** Native material maps, never a picture of the car pasted over its geometry. */
function materialTextures(): NonNullable<typeof textures> {
  if (textures) return textures;
  const make = (width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, color = false) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Car paint requires Canvas 2D texture support.');
    paint(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4; texture.name = 'SORA coupe painted material';
    return texture;
  };
  const brush = make(256, 256, ctx => {
    const random = seeded(1986); ctx.fillStyle = '#b7b7b7'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) {
      const grey = 149 + Math.floor(random() * 57);
      ctx.fillStyle = `rgba(${grey},${grey},${grey},${0.08 + random() * 0.13})`;
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 19, 0.5 + random() * 2.5);
    }
  });
  brush.wrapS = brush.wrapT = THREE.RepeatWrapping; brush.repeat.set(3, 2);
  const pigment = make(1024, 512, ctx => {
    const random = seeded(8627); ctx.fillStyle = '#eceae4'; ctx.fillRect(0, 0, 1024, 512);
    for (let stroke = 0; stroke < 1450; stroke++) {
      const x = random() * 1024, y = random() * 512, length = 3 + random() * 36;
      ctx.fillStyle = stroke % 3 ? '#bab6b216' : '#ffffff29';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length, y - random() * 1.8);
      ctx.lineTo(x + length * 0.91, y + 0.5 + random() * 1.8); ctx.lineTo(x + length * 0.1, y + 1.2); ctx.closePath(); ctx.fill();
    }
  }, true);
  pigment.wrapS = pigment.wrapT = THREE.RepeatWrapping;
  const rubber = make(128, 128, ctx => {
    const random = seeded(98); ctx.fillStyle = '#6e6e6e'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = random() > 0.5 ? '#97979740' : '#40404030';
      ctx.fillRect(random() * 128, random() * 128, 1, 1);
    }
  });
  rubber.wrapS = rubber.wrapT = THREE.RepeatWrapping; rubber.repeat.set(3, 1);
  const glass = make(1024, 512, ctx => {
    const random = seeded(4186), sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#414667'); sky.addColorStop(0.46, '#71667e');
    sky.addColorStop(0.78, '#b49194'); sky.addColorStop(1, '#443e59');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 512);
    // Broken, elongated pigment strokes imply reflected dusk clouds while
    // live 3D lighting and the scene environment supply the moving highlights.
    for (let cloud = 0; cloud < 90; cloud++) {
      const x = random() * 1024, y = 80 + random() * 360, length = 30 + random() * 160;
      ctx.fillStyle = cloud % 3 ? '#cf9e9e36' : '#3e3c653b';
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let point = 1; point < 9; point++) ctx.lineTo(x + point * length / 8, y - 3 - random() * 8);
      ctx.lineTo(x + length * 0.85, y + 3 + random() * 4); ctx.lineTo(x + length * 0.1, y + 5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#a6c1cd18'; ctx.beginPath(); ctx.moveTo(50, 0); ctx.lineTo(145, 0);
    ctx.lineTo(420, 512); ctx.lineTo(352, 512); ctx.closePath(); ctx.fill();
  }, true);
  const lens = make(256, 128, ctx => {
    const light = ctx.createLinearGradient(0, 0, 0, 128);
    light.addColorStop(0, '#ffffff'); light.addColorStop(0.22, '#d9d9d9');
    light.addColorStop(0.55, '#929292'); light.addColorStop(1, '#cccccc');
    ctx.fillStyle = light; ctx.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = '#24242435'; ctx.fillRect(x, 0, 1, 128);
      ctx.fillStyle = '#ffffff60'; ctx.fillRect(x + 1, 0, 1, 128);
    }
    for (let y = 0; y < 128; y += 8) { ctx.fillStyle = '#1b1b1b22'; ctx.fillRect(0, y, 256, 1); }
  }, true);
  const plate = make(512, 192, ctx => {
    ctx.fillStyle = '#ded8b9'; ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = '#9d9b89'; ctx.lineWidth = 5; ctx.strokeRect(7, 7, 498, 178);
    ctx.fillStyle = '#2e4841'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 119px monospace'; ctx.fillText('19-86', 256, 107);
    ctx.font = '25px sans-serif'; ctx.fillText('品川  58', 256, 30);
    for (const x of [72, 440]) {
      ctx.fillStyle = '#666d65'; ctx.beginPath(); ctx.arc(x, 24, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c3c5ae'; ctx.fillRect(x - 4, 23, 8, 2);
    }
  }, true);
  textures = { brush, pigment, rubber, glass, lens, plate }; return textures;
}

function add(parts: Parts, key: Paint, geometry: THREE.BufferGeometry): void { (parts[key] ??= []).push(geometry); }
function box(parts: Parts, key: Paint, size: Point, at: Point, radius = 0.015, rotation?: Point): void {
  const geometry = radius > 0 ? new RoundedBoxGeometry(...size, radius > 0.02 ? 2 : 1, radius) : new THREE.BoxGeometry(...size);
  if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
  geometry.translate(...at); add(parts, key, geometry);
}
function rod(parts: Parts, key: Paint, a: Point, b: Point, radius: number, endRadius = radius, segments = 7): void {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(endRadius, radius, direction.length(), segments, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(0.5).toArray()); add(parts, key, geometry);
}
function beam(parts: Parts, key: Paint, a: Point, b: Point, width: number, depth: number): void {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
  const geometry = new RoundedBoxGeometry(width, direction.length(), depth, 1, Math.min(width, depth) * 0.2);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()));
  geometry.translate(...start.add(end).multiplyScalar(0.5).toArray()); add(parts, key, geometry);
}
function patch(parts: Parts, key: Paint, point: (u: number, v: number) => Point, columns = 8, rows = 6, reverse = false): void {
  const position: number[] = [], uv: number[] = [], index: number[] = [];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    position.push(...point(col / columns, row / rows)); uv.push(col / columns, 1 - row / rows);
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + 1, c = a + columns + 1, d = c + 1;
    index.push(...(reverse ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(index); geometry.computeVertexNormals();
  add(parts, key, geometry);
}
function quad(parts: Parts, key: Paint, corners: readonly [Point, Point, Point, Point], reverse = false): void {
  patch(parts, key, (u, v) => {
    const [a, b, c, d] = corners;
    return [0, 1, 2].map(axis => a[axis]! * (1 - u) * (1 - v) + b[axis]! * u * (1 - v)
      + c[axis]! * u * v + d[axis]! * (1 - u) * v) as unknown as Point;
  }, 3, 3, reverse);
}
function merge(parts: Parts): Assembly {
  const output: Assembly = {};
  for (const [key, geometries] of Object.entries(parts) as [Paint, THREE.BufferGeometry[]][]) {
    const flat = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
    const joined = mergeGeometries(flat, false);
    if (!joined) throw new Error(`Cannot assemble coupe ${key} geometry.`);
    joined.computeBoundingSphere(); joined.computeBoundingBox(); joined.name = `SORA coupe ${key}`;
    output[key] = joined;
    for (const geometry of new Set([...geometries, ...flat])) geometry.dispose();
  }
  return output;
}

function modelGeometry(): GeometryLibrary {
  if (geometryLibrary) return geometryLibrary;
  const body: Parts = {}, wheel: Parts = {}, aero: Parts = {};
  // The side profile is a continuous metal shell, with the wheel arches cut
  // into it before extrusion. The tyres never sit outside a solid toy box.
  const outline = new THREE.Shape();
  outline.moveTo(-2.015, 0.295); outline.lineTo(-2.055, 0.49); outline.lineTo(-2.025, 0.73);
  outline.quadraticCurveTo(-1.97, 0.805, -1.81, 0.817); outline.lineTo(-1.60, 0.89);
  outline.lineTo(1.05, 0.90); outline.lineTo(1.87, 0.79); outline.quadraticCurveTo(2.045, 0.76, 2.065, 0.64);
  outline.lineTo(2.065, 0.35); outline.lineTo(1.78, 0.275); outline.lineTo(1.695, 0.29);
  outline.bezierCurveTo(1.695, 0.965, 0.875, 0.965, 0.875, 0.29);
  outline.lineTo(-0.875, 0.29); outline.bezierCurveTo(-0.875, 0.965, -1.695, 0.965, -1.695, 0.29);
  outline.lineTo(-2.015, 0.295); outline.closePath();
  const shell = new THREE.ExtrudeGeometry(outline, { depth: 1.79, bevelEnabled: true,
    bevelSegments: 3, steps: 1, bevelSize: 0.036, bevelThickness: 0.055, curveSegments: 16 });
  shell.translate(0, 0, -0.895); shell.rotateY(-Math.PI / 2);
  const positions = shell.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const z = positions.getZ(vertex), y = positions.getY(vertex);
    const taper = 1 - 0.05 * clamp((Math.abs(z) - 1.55) / 0.5, 0, 1) - 0.02 * clamp((0.4 - y) / 0.2, 0, 1);
    positions.setX(vertex, positions.getX(vertex) * taper);
  }
  shell.computeVertexNormals(); add(body, 'paint', shell);
  box(body, 'black', [1.43, 0.16, 3.8], [0, 0.29, 0], 0.03);
  box(body, 'shade', [1.77, 0.10, 1.75], [0, 0.32, 0], 0.02);
  // Raised central bonnet and hatch are lightly domed stamped panels.
  patch(body, 'paint', (u, v) => {
    const z = 1.11 + v * 0.81, width = 0.75 + v * 0.025;
    return [(u - 0.5) * width * 2, 0.90 - v * 0.118 + Math.sin(u * Math.PI) * 0.019, z];
  });
  patch(body, 'paint', (u, v) => [(u - 0.5) * (1.50 + 0.27 * v), 0.891 - v * 0.085 + Math.sin(u * Math.PI) * 0.014, -1.60 - v * 0.31], 8, 6, true);
  // Roof volume: curved crown, lower inner surface and joined edge rails.
  patch(body, 'paint', (u, v) => [(u - 0.5) * 1.30, 1.365 + Math.sin(u * Math.PI) * 0.066
    + Math.sin(v * Math.PI) * 0.014, -0.57 + v * 1.13], 12, 8);
  box(body, 'seats', [1.23, 0.034, 1.09], [0, 1.363, -0.005], 0.015);
  patch(body, 'glass', (u, v) => {
    const width = 0.72 - v * 0.105;
    return [(u - 0.5) * width * 2, 0.954 + v * 0.394 + Math.sin(u * Math.PI) * 0.012,
      -1.556 + v * 0.967 - Math.sin(u * Math.PI) * 0.006];
  }, 12, 8);
  patch(body, 'glass', (u, v) => {
    const width = 0.612 + v * 0.116;
    return [(u - 0.5) * width * 2, 1.349 - v * 0.397 + Math.sin(u * Math.PI) * 0.019,
      0.588 + v * 0.445 + Math.sin(u * Math.PI) * 0.012];
  }, 12, 8);
  for (const end of [-1, 1]) patch(body, 'paint', (u, v) => {
    const width = 0.616 + v * 0.034, crown = Math.sin(u * Math.PI);
    return [(u - 0.5) * width * 2, 1.348 + crown * 0.012 + v * (0.017 + crown * 0.054),
      end < 0 ? -0.592 + v * 0.022 : 0.588 - v * 0.028];
  }, 12, 3, end > 0);
  for (const side of [-1, 1]) {
    const s = (x: number, y: number, z: number): Point => [side * x, y, z];
    // A and C pillars have depth; the glazing rests inside their seal channels.
    beam(body, 'paint', s(0.79, 0.912, -1.608), s(0.647, 1.383, -0.575), 0.067, 0.068);
    beam(body, 'paint', s(0.647, 1.381, 0.56), s(0.793, 0.918, 1.095), 0.059, 0.061);
    rod(body, 'paint', s(0.65, 1.38, -0.575), s(0.65, 1.38, 0.56), 0.033);
    rod(body, 'black', s(0.802, 0.942, -1.55), s(0.802, 0.944, 1.05), 0.021);
    rod(body, 'chrome', s(0.812, 0.923, -1.54), s(0.812, 0.925, 1.035), 0.005);
    const rearWindow: [Point, Point, Point, Point] = [s(0.791, 0.964, -1.477), s(0.791, 0.964, -0.174),
      s(0.677, 1.345, -0.174), s(0.677, 1.345, -0.55)];
    const frontWindow: [Point, Point, Point, Point] = [s(0.791, 0.964, -0.102), s(0.791, 0.964, 0.985),
      s(0.677, 1.345, 0.544), s(0.677, 1.345, -0.102)];
    for (const corners of [rearWindow, frontWindow]) {
      quad(body, 'glass', corners, side === -1);
      for (let edge = 0; edge < 4; edge++) rod(body, 'black', corners[edge]!, corners[(edge + 1) % 4]!, 0.010);
    }
    beam(body, 'black', s(0.805, 0.944, -0.138), s(0.671, 1.37, -0.138), 0.033, 0.040);
    rod(body, 'chrome', s(0.812, 0.958, -0.117), s(0.683, 1.353, -0.117), 0.004);
    // Door seams, belt line and stone guards conform to the formed body.
    rod(body, 'shade', s(0.956, 0.49, -0.715), s(0.950, 0.847, -0.715), 0.004);
    rod(body, 'shade', s(0.956, 0.48, 0.83), s(0.950, 0.859, 0.89), 0.004);
    rod(body, 'shade', s(0.955, 0.482, -0.71), s(0.955, 0.482, 0.83), 0.004);
    box(body, 'rubber', [0.023, 0.044, 1.58], s(0.957, 0.473, 0.065), 0.008);
    box(body, 'chrome', [0.026, 0.006, 1.58], s(0.958, 0.500, 0.065), 0.002);
    box(body, 'black', [0.027, 0.044, 0.176], s(0.956, 0.766, -0.481), 0.009);
    box(body, 'chrome', [0.038, 0.013, 0.134], s(0.970, 0.771, -0.478), 0.005);
    rod(body, 'chrome', s(0.977, 0.748, -0.596), s(0.986, 0.748, -0.596), 0.009, 0.009, 8);
    box(body, 'accent', [0.033, 0.061, 1.75], s(0.923, 0.330, 0), 0.013);
    // Thin folded arches follow the actual hole rather than hiding the tyres.
    for (const z of [-1.285, 1.285]) {
      const arc: THREE.Vector3[] = [];
      for (let step = 0; step <= 20; step++) {
        const theta = step * Math.PI / 20;
        arc.push(new THREE.Vector3(side * 0.946, 0.340 + Math.sin(theta) * 0.39, z + Math.cos(theta) * 0.405));
      }
      add(body, 'shade', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 20, 0.012, 5, false));
    }
    // Mirror housing, support and inset reflective glass are all separate solids.
    beam(body, 'black', s(0.80, 0.998, 0.80), s(0.970, 1.005, 0.81), 0.052, 0.061);
    box(body, 'paint', [0.153, 0.107, 0.244], s(1.004, 1.047, 0.805), 0.028, [0, side * 0.12, 0]);
    box(body, 'black', [0.125, 0.080, 0.018], s(1.006, 1.048, 0.687), 0.009, [0, side * 0.12, 0]);
    box(body, 'glass', [0.105, 0.063, 0.013], s(1.006, 1.05, 0.675), 0.008, [0, side * 0.12, 0]);
    // Front fender indicator and a small fuel filler on the left rear quarter.
    box(body, 'amber', [0.016, 0.038, 0.075], s(0.949, 0.687, 1.78), 0.009);
    if (side === -1) {
      box(body, 'shade', [0.009, 0.113, 0.16], s(0.951, 0.787, -1.73), 0.014);
      box(body, 'paint', [0.012, 0.101, 0.148], s(0.956, 0.787, -1.73), 0.011);
    }
    // Sculpted cloth buckets, headrests and restrained upholstery piping.
    const seatX = side * 0.372;
    box(body, 'seats', [0.397, 0.485, 0.16], [seatX, 0.908, -0.265], 0.066, [-0.15, 0, 0]);
    box(body, 'seats', [0.407, 0.117, 0.448], [seatX, 0.637, -0.084], 0.046);
    box(body, 'seats', [0.249, 0.17, 0.129], [seatX, 1.205, -0.305], 0.042);
    for (const edge of [-1, 1]) {
      rod(body, 'black', [seatX + edge * 0.131, 0.759, -0.35], [seatX + edge * 0.131, 1.091, -0.303], 0.007);
    }
    // Tail lamps sit inside a deep black surround, with separate amber and
    // clear lenses, seals and internal horizontal reflector divisions.
    box(body, 'black', [0.686, 0.213, 0.057], s(0.60, 0.594, -2.087), 0.016);
    box(body, 'red', [0.478, 0.177, 0.046], s(0.558, 0.595, -2.122), 0.012);
    box(body, 'amber', [0.156, 0.177, 0.046], s(0.875, 0.595, -2.107), 0.012);
    box(body, 'reverse', [0.11, 0.064, 0.008], s(0.367, 0.546, -2.149), 0.006);
    box(body, 'black', [0.630, 0.005, 0.01], s(0.625, 0.591, -2.152), 0.001);
    for (const division of [0.457, 0.619, 0.792]) box(body, 'black', [0.005, 0.169, 0.01], s(division, 0.595, -2.153), 0.001);
    box(body, 'chrome', [0.636, 0.009, 0.01], s(0.622, 0.696, -2.122), 0.002);
    box(body, 'black', [0.615, 0.204, 0.051], s(0.59, 0.604, 2.12), 0.013);
    box(body, 'headlamp', [0.526, 0.167, 0.035], s(0.586, 0.610, 2.151), 0.009);
    box(body, 'amber', [0.346, 0.049, 0.02], s(0.622, 0.435, 2.134), 0.009);
    for (let divider = 0; divider < 4; divider++) box(body, 'chrome', [0.007, 0.154, 0.012], s(0.4 + divider * 0.122, 0.61, 2.169), 0.001);
    rod(body, 'shade', s(0.748, 0.907, 1.11), s(0.774, 0.79, 1.96), 0.003);
  }
  // Rear hatch seals and glass demister lines have actual surface depth.
  rod(body, 'black', [-0.77, 0.917, -1.587], [0.77, 0.917, -1.587], 0.019);
  rod(body, 'black', [-0.615, 1.364, -0.593], [0.615, 1.364, -0.593], 0.013);
  rod(body, 'black', [-0.616, 1.367, 0.584], [0.616, 1.367, 0.584], 0.012);
  rod(body, 'black', [-0.742, 0.935, 1.057], [0.742, 0.935, 1.057], 0.016);
  for (let line = 1; line < 9; line++) {
    const v = line / 10, width = 0.718 - v * 0.105;
    rod(body, 'accent', [-width, 0.958 + v * 0.394, -1.562 + v * 0.967],
      [width, 0.958 + v * 0.394, -1.562 + v * 0.967], 0.0015, 0.0015, 4);
  }
  rod(body, 'black', [-0.49, 0.947, -1.607], [0.12, 1.029, -1.370], 0.009);
  rod(body, 'rubber', [-0.13, 1.045, -1.356], [0.38, 1.045, -1.356], 0.010);
  box(body, 'black', [0.24, 0.075, 0.075], [0, 1.014, -1.365], 0.018);
  box(body, 'red', [0.197, 0.043, 0.013], [0, 1.025, -1.410], 0.007);
  box(body, 'black', [1.804, 0.038, 0.043], [0, 0.751, -2.043], 0.014);
  box(body, 'paint', [1.837, 0.045, 0.152], [0, 0.83, -1.943], 0.020);
  box(body, 'rubber', [1.836, 0.165, 0.166], [0, 0.35, -2.025], 0.034);
  box(body, 'rubber', [1.838, 0.118, 0.126], [0, 0.347, 2.074], 0.028);
  box(body, 'black', [1.55, 0.092, 0.030], [0, 0.446, 2.124], 0.009);
  box(body, 'chrome', [1.789, 0.017, 0.025], [0, 0.444, -2.095], 0.006);
  box(body, 'black', [0.708, 0.236, 0.079], [0, 0.580, -2.077], 0.024);
  box(body, 'chrome', [0.035, 0.035, 0.019], [0, 0.785, -2.049], 0.011);
  box(body, 'plate', [0.435, 0.160, 0.015], [0, 0.566, -2.127], 0.008, [0, Math.PI, 0]);
  box(body, 'black', [0.488, 0.145, 0.052], [0, 0.615, 2.115], 0.011);
  for (let grille = 0; grille < 4; grille++) box(body, 'chrome', [0.446, 0.006, 0.007], [0, 0.566 + grille * 0.029, 2.15], 0.001);
  box(body, 'black', [1.42, 0.17, 0.303], [0, 0.889, 0.797], 0.036);
  box(body, 'instrument', [0.248, 0.067, 0.009], [0.39, 0.934, 0.638], 0.008);
  box(body, 'black', [0.189, 0.18, 0.72], [0, 0.582, 0.236], 0.028);
  rod(body, 'black', [0, 0.66, 0.17], [0, 0.824, 0.147], 0.012);
  add(body, 'black', new THREE.SphereGeometry(0.027, 10, 6).translate(0, 0.824, 0.147));
  const steeringWheel = new THREE.TorusGeometry(0.140, 0.013, 7, 24);
  steeringWheel.rotateX(-0.40); steeringWheel.translate(0.39, 0.985, 0.49); add(body, 'rubber', steeringWheel);
  for (let spoke = 0; spoke < 3; spoke++) {
    const a = spoke * TAU / 3;
    rod(body, 'black', [0.39, 0.985, 0.49], [0.39 + Math.cos(a) * 0.131,
      0.985 + Math.sin(a) * 0.121, 0.49 - Math.sin(a) * 0.05], 0.010);
  }
  for (const x of [-0.61, -0.435]) {
    rod(body, 'chrome', [x, 0.234, -1.8], [x, 0.234, -2.156], 0.078, 0.080, 18);
    rod(body, 'black', [x, 0.234, -2.155], [x, 0.234, -2.166], 0.060, 0.063, 18);
    const lip = new THREE.TorusGeometry(0.071, 0.007, 6, 20); lip.translate(x, 0.234, -2.16); add(body, 'alloy', lip);
  }
  // Optional club aero remains a real profiled wing with two metal supports.
  for (const side of [-1, 1]) beam(aero, 'black', [side * 0.62, 0.848, -1.72], [side * 0.62, 1.012, -1.76], 0.04, 0.089);
  box(aero, 'accent', [1.91, 0.052, 0.283], [0, 1.029, -1.799], 0.023, [-0.085, 0, 0]);
  for (const side of [-1, 1]) box(aero, 'paint', [0.027, 0.100, 0.293], [side * 0.947, 1.039, -1.797], 0.010);

  // A toroidal tyre profile gives round shoulders, tread and recessed alloys.
  const tyreProfile = [[0.205, -0.116], [0.275, -0.139], [0.329, -0.118], [0.351, -0.068],
    [0.358, 0], [0.351, 0.068], [0.329, 0.118], [0.275, 0.139], [0.205, 0.116], [0.205, -0.116]];
  const tyre = new THREE.LatheGeometry(tyreProfile.map(([radius, axial]) => new THREE.Vector2(radius!, axial!)), 32);
  tyre.rotateZ(-Math.PI / 2); add(wheel, 'rubber', tyre);
  for (let groove = 0; groove < 28; groove++) {
    const a = groove * TAU / 28;
    const tread = new THREE.BoxGeometry(0.176, 0.004, 0.010);
    tread.rotateY(groove % 2 ? 0.26 : -0.26); tread.translate(0, 0.356, 0); tread.rotateX(a); add(wheel, 'black', tread);
  }
  rod(wheel, 'alloy', [-0.106, 0, 0], [0.106, 0, 0], 0.224, 0.224, 28);
  rod(wheel, 'black', [0.108, 0, 0], [0.120, 0, 0], 0.199, 0.199, 28);
  const rim = new THREE.TorusGeometry(0.221, 0.014, 7, 32); rim.rotateY(Math.PI / 2); rim.translate(0.130, 0, 0); add(wheel, 'chrome', rim);
  for (let spoke = 0; spoke < 6; spoke++) {
    const a = spoke * TAU / 6;
    beam(wheel, 'alloy', [0.135, Math.sin(a) * 0.057, Math.cos(a) * 0.057],
      [0.122, Math.sin(a + 0.12) * 0.211, Math.cos(a + 0.12) * 0.211], 0.047, 0.030);
    rod(wheel, 'chrome', [0.147, Math.sin(a) * 0.047, Math.cos(a) * 0.047],
      [0.160, Math.sin(a) * 0.047, Math.cos(a) * 0.047], 0.009, 0.009, 6);
  }
  rod(wheel, 'alloy', [0.119, 0, 0], [0.154, 0, 0], 0.069, 0.066, 16);
  rod(wheel, 'black', [0.155, 0, 0], [0.157, 0, 0], 0.030, 0.030, 14);
  // Twin exhaust plumes are tapered volumes, including in an aerial view.
  const flames: THREE.BufferGeometry[] = [];
  for (const x of [-0.61, -0.435]) {
    const flame = new THREE.ConeGeometry(0.061, 0.36, 9, 1); flame.rotateX(-Math.PI / 2);
    flame.translate(x, 0.234, -0.18); flames.push(flame.toNonIndexed()); flame.dispose();
  }
  const flame = mergeGeometries(flames, false)!; for (const part of flames) part.dispose();
  geometryLibrary = { body: merge(body), wheel: merge(wheel), aero: merge(aero), flame }; return geometryLibrary;
}

/** Metres; origin at ground centre, +Z forward, +Y up and +X to the right. */
export function createCarModel(color: string, flag: THREE.Texture): CarModel {
  const maps = materialTextures(), geometries = modelGeometry();
  const paint = new THREE.MeshPhysicalMaterial({ color, map: maps.pigment, metalness: 0.15, roughness: 0.60,
    clearcoat: 0.25, clearcoatRoughness: 0.33, roughnessMap: maps.brush, bumpMap: maps.brush, bumpScale: 0.0022 });
  const shade = new THREE.MeshStandardMaterial({ color, map: maps.pigment, metalness: 0.12, roughness: 0.64, roughnessMap: maps.brush });
  const accent = new THREE.MeshStandardMaterial({ color: '#bba78c', metalness: 0.34, roughness: 0.48 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#171923', roughness: 0.97, bumpMap: maps.rubber, bumpScale: 0.0024 });
  const black = new THREE.MeshStandardMaterial({ color: '#202431', roughness: 0.66, metalness: 0.16 });
  const alloy = new THREE.MeshStandardMaterial({ color: '#97a3b2', roughness: 0.38, metalness: 0.79 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#bec1bd', roughness: 0.24, metalness: 0.87 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#a4a9ca', map: maps.glass, roughness: 0.21,
    metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.16, transparent: true, opacity: 0.83, depthWrite: false });
  const red = new THREE.MeshPhysicalMaterial({ color: '#b92b38', map: maps.lens, bumpMap: maps.lens,
    bumpScale: 0.0008, metalness: 0.10, roughness: 0.29, clearcoat: 0.72, emissive: '#a41628', emissiveIntensity: 0.35 });
  const amber = new THREE.MeshPhysicalMaterial({ color: '#d78c2a', map: maps.lens, metalness: 0.14,
    roughness: 0.28, clearcoat: 0.7, emissive: '#8d4312', emissiveIntensity: 0.14 });
  const headlamp = new THREE.MeshPhysicalMaterial({ color: '#f0dcaa', map: maps.lens, bumpMap: maps.lens,
    bumpScale: 0.001, roughness: 0.26, metalness: 0.17, clearcoat: 0.68, emissive: '#ffdaa0', emissiveIntensity: 0.78 });
  const reverse = new THREE.MeshStandardMaterial({ color: '#c1c7c3', map: maps.lens, roughness: 0.36, metalness: 0.24 });
  const plate = new THREE.MeshStandardMaterial({ color: '#fff5d9', map: maps.plate, roughness: 0.67, metalness: 0.05 });
  const seats = new THREE.MeshStandardMaterial({ color: '#242432', roughness: 0.98, bumpMap: maps.rubber, bumpScale: 0.001 });
  const instrument = new THREE.MeshStandardMaterial({ color: '#292d35', emissive: '#bb9465', emissiveIntensity: 0.14, roughness: 0.6 });
  const materials: Record<Paint, THREE.Material> = { paint, shade, accent, rubber, black, alloy, chrome, glass,
    red, amber, headlamp, reverse, plate, seats, instrument };
  const group = new THREE.Group(); group.name = 'SORA 1986 sculpted coupe';
  const attach = (parent: THREE.Group, assembly: Assembly) => {
    for (const [key, geometry] of Object.entries(assembly) as [Paint, THREE.BufferGeometry][]) {
      const mesh = new THREE.Mesh(geometry, materials[key]); mesh.name = `Coupe ${key}`;
      mesh.castShadow = key !== 'glass'; mesh.receiveShadow = key !== 'glass';
      if (key === 'glass') mesh.renderOrder = 1;
      parent.add(mesh);
    }
  };
  attach(group, geometries.body);
  const aero = new THREE.Group(); aero.name = 'Optional club aero'; attach(aero, geometries.aero); aero.visible = false; group.add(aero);
  const wheels: { steering: THREE.Group; spin: THREE.Group; side: number; front: boolean }[] = [];
  for (const side of [-1, 1]) for (const z of [-1.285, 1.285]) {
    const steering = new THREE.Group(), orientation = new THREE.Group(), spin = new THREE.Group();
    steering.name = `${z > 0 ? 'Front' : 'Rear'} ${side > 0 ? 'right' : 'left'} wheel`;
    steering.position.set(side * 0.89, 0.358, z); orientation.rotation.y = side < 0 ? Math.PI : 0;
    steering.add(orientation); orientation.add(spin); attach(spin, geometries.wheel); group.add(steering);
    wheels.push({ steering, spin, side, front: z > 0 });
  }
  // The supplied flag remains an exact texture on small physical decals.
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flag, transparent: true, alphaTest: 0.03,
    roughness: 0.59, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const flagGeometries: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const decal = new THREE.PlaneGeometry(0.31, 0.186); decal.rotateY(side * Math.PI / 2);
    decal.translate(side * 0.959, 0.651, 0.01); flagGeometries.push(decal.toNonIndexed()); decal.dispose();
  }
  const rearFlag = new THREE.PlaneGeometry(0.112, 0.067); rearFlag.rotateY(Math.PI);
  rearFlag.translate(-0.176, 0.745, -2.087); flagGeometries.push(rearFlag.toNonIndexed()); rearFlag.dispose();
  const decalGeometry = mergeGeometries(flagGeometries, false)!; for (const decal of flagGeometries) decal.dispose();
  const decals = new THREE.Mesh(decalGeometry, flagMaterial); decals.name = 'Exact SORA club flag decals'; group.add(decals);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#6bcde7', transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#e4fff2', transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const exhaust = new THREE.Group(); exhaust.position.z = -2.163; exhaust.name = 'Volumetric turbo exhaust';
  const flame = new THREE.Mesh(geometries.flame, flameMaterial), core = new THREE.Mesh(geometries.flame, coreMaterial);
  core.scale.set(1, 0.62, 0.55); core.position.y = 0.234 * (1 - 0.62);
  exhaust.add(flame, core); exhaust.visible = false; group.add(exhaust);
  const modelOpacity = { value: 1 };
  for (const material of [...Object.values(materials), flagMaterial, flameMaterial, coreMaterial]) {
    const previousCompile = material.onBeforeCompile, previousCacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      shader.uniforms.uSoraModelOpacity = modelOpacity;
      // Every material uses the same framebuffer-coordinate threshold. A
      // retained pixel keeps the normal opaque surfaces and their depth writes;
      // a discarded pixel contains no part of this car, including its glazing.
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${screenDoorShader}\nvoid main() {\n`
        + '  if (uSoraModelOpacity < 1.0 && soraCarThreshold(gl_FragCoord.xy) >= uSoraModelOpacity) discard;\n');
    };
    material.customProgramCacheKey = () => `${previousCacheKey.call(material)}|sora-car-screen-door-v1`;
  }
  const shadowMeshes: THREE.Mesh[] = [];
  group.traverse(object => { if (object instanceof THREE.Mesh && object.castShadow) shadowMeshes.push(object); });
  let lastOpacity = 1, lastColor = '', lastAccent = '', lastAero = false, lastTime: number | null = null, wheelAngle = 0;
  const model: CarModel = {
    group,
    setAppearance(bodyColor, trimColor = '#bba78c', hasAero = false) {
      if (bodyColor !== lastColor) {
        paint.color.set(bodyColor); shade.color.set(bodyColor).lerp(new THREE.Color('#34384c'), 0.36); lastColor = bodyColor;
      }
      if (trimColor !== lastAccent) { accent.color.set(trimColor); lastAccent = trimColor; }
      if (hasAero !== lastAero) { aero.visible = hasAero; lastAero = hasAero; }
    },
    setOpacity(value) {
      const opacity = Number.isFinite(value) ? clamp(value, 0, 1) : 1;
      if (opacity === lastOpacity) return;
      modelOpacity.value = opacity;
      // A car being retired from the camera corridor must not leave a solid
      // shadow in front of the followed bumper. The caller owns visibility.
      for (const mesh of shadowMeshes) mesh.castShadow = opacity === 1;
      lastOpacity = opacity;
    },
    animate(speedMetersPerSecond, steerRadians, braking, boosting, time) {
      const speed = Number.isFinite(speedMetersPerSecond) ? speedMetersPerSecond : 0;
      const now = Number.isFinite(time) ? time : 0;
      if (lastTime !== null && now < lastTime) wheelAngle = 0;
      const elapsed = lastTime === null ? 0 : clamp(now - lastTime, 0, 0.1); lastTime = now;
      wheelAngle = (wheelAngle + speed * elapsed / 0.358) % TAU;
      const steering = Number.isFinite(steerRadians) ? clamp(steerRadians, -0.52, 0.52) : 0;
      for (const wheel of wheels) {
        wheel.steering.rotation.y = wheel.front ? steering : 0;
        wheel.spin.rotation.x = wheelAngle * wheel.side;
      }
      red.emissiveIntensity = braking ? 2.15 : 0.35;
      exhaust.visible = boosting;
      exhaust.scale.z = boosting ? 0.85 + Math.sin(now * 39) * 0.16 : 1;
    },
  };
  model.setAppearance(color);
  return model;
}
