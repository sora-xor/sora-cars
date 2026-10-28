import * as THREE from 'three';
import { scannedSurface } from './surfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Meter-scale architecture with scanned surfaces. Frontages face -Z; origins are at ground level. */
type Random = () => number;
type Paint = 'plaster' | 'wood' | 'tiles' | 'bark' | 'leaves';
type Palette = ReturnType<typeof createPalette>;

function random(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function paintedTexture(kind: Paint): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const rng = random(kind.length * 3197);
  context.fillStyle = ({ plaster: '#c0b49f', wood: '#65544e', tiles: '#677386', bark: '#716657', leaves: '#d6d7be' })[kind];
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) {
    const light = rng() > 0.55;
    context.fillStyle = light ? `rgba(255,241,211,${0.025 + rng() * 0.1})` : `rgba(12,19,38,${0.015 + rng() * 0.12})`;
    const size = 0.4 + rng() * (kind === 'plaster' ? 2.4 : 4);
    context.fillRect(rng() * 256, rng() * 256, size, size * (0.35 + rng()));
  }
  if (kind === 'wood' || kind === 'bark') {
    for (let i = 0; i < 130; i++) {
      const x = rng() * 256;
      context.strokeStyle = `rgba(${rng() > 0.4 ? '12,17,27' : '234,191,126'},${0.12 + rng() * 0.35})`;
      context.lineWidth = 0.5 + rng() * 2;
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x + rng() * 11 - 5, 80, x - rng() * 14, 180, x + rng() * 9, 256);
      context.stroke();
    }
  } else if (kind === 'tiles') {
    for (let y = 0; y < 256; y += 32) {
      for (let x = -16; x < 256; x += 32) {
        context.fillStyle = `rgba(13,18,34,${0.14 + rng() * 0.12})`;
        context.fillRect(x, y + 28, 32, 4);
        context.fillRect(x, y, 2, 32);
        context.fillStyle = 'rgba(223,166,154,.2)';
        context.fillRect(x + 3, y + 25, 24, 2);
      }
    }
  } else if (kind === 'plaster') {
    for (let i = 0; i < 46; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      const radius = 5 + rng() * 18;
      const wash = context.createRadialGradient(x, y, 0, x, y, radius);
      wash.addColorStop(0, i % 3 ? 'rgba(35,42,60,.1)' : 'rgba(246,218,171,.13)');
      wash.addColorStop(1, 'rgba(86,79,79,0)');
      context.fillStyle = wash;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Soft water marks and worn pigment replace conspicuous square noise patches.
    for (let i = 0; i < 16; i++) {
      const x = rng() * 256;
      const y = rng() * 210;
      const length = 12 + rng() * 44;
      const stain = context.createLinearGradient(0, y, 0, y + length);
      stain.addColorStop(0, 'rgba(47,43,43,.11)');
      stain.addColorStop(1, 'rgba(47,43,43,0)');
      context.fillStyle = stain;
      context.fillRect(x, y, 1 + rng() * 3, length);
    }
    for (let i = 0; i < 22; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      context.strokeStyle = 'rgba(36,32,42,.13)';
      context.lineWidth = 0.7;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 2, y + 12);
      context.lineTo(x - 1, y + 17);
      context.stroke();
    }
  } else {
    context.strokeStyle = 'rgba(70,72,48,.25)';
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(128, 0);
    context.lineTo(128, 256);
    for (let y = 24; y < 240; y += 28) {
      context.moveTo(128, y);
      context.lineTo(52, y + 45);
      context.moveTo(128, y);
      context.lineTo(204, y + 45);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Repaint the photographed plaster without multiplying a second brown cast into its albedo. */
function weatheredPlasterMaterial(color: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, ...scannedSurface('grey_plaster_03'),
    normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95 });
  material.name = `weathered-plaster-${color}`;
  material.onBeforeCompile = shader => {
    const calibratedMap = THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', /* glsl */ `
      // Retain the photograph's cracks and wear, with neutral paint reflectance.
      // Normal, roughness and occlusion maps continue through the standard PBR shader.
      float plasterLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      sampledDiffuseColor.rgb = clamp(mix(vec3(plasterLuma), sampledDiffuseColor.rgb, 0.1) * 3.0, 0.0, 1.15);
      diffuseColor *= sampledDiffuseColor;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', calibratedMap);
  };
  material.customProgramCacheKey = () => 'sora-weathered-plaster-reflectance-v1';
  material.userData.surfaceMeters = 1;
  return material;
}

/** Intact paint: preserve measured scan variation around an authored paint color. */
function plasterMaterial(color: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, ...scannedSurface('beige_wall_001'),
    normalScale: new THREE.Vector2(1, 1), roughness: 1, metalness: 0 });
  material.name = `painted-plaster-${color}`;
  material.userData.surfaceMeters = 3;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', /* glsl */ `
        // Mean decoded linear RGB of the official 2K source. Repainting retains
        // its fine relative variation while the material color sets the pigment.
        sampledDiffuseColor.rgb /= vec3(0.339758, 0.262138, 0.188094);
        diffuseColor.rgb = min(diffuseColor.rgb * sampledDiffuseColor.rgb, vec3(1.0));
        diffuseColor.a *= sampledDiffuseColor.a;
      `));
  };
  material.customProgramCacheKey = () => 'sora-maintained-plaster-v1';
  return material;
}

/**
 * Lit night windows (R3 night value): a stable hashed share of the existing
 * window room backs glows warm amber (a few TV-blue or lavender), more at
 * night and fewer toward sunrise. A material change on existing geometry: the
 * room backs keep their meshes, UVs and the baked architecture ambient (which
 * re-runs this hook on its material clones). Each window is identified in the
 * shader from its own face: the face's size and centre come from the UV
 * Jacobian (a box face spans UV 0..1), hashed with the building's world
 * origin, so each window decides once per placement and a whole face lights.
 * x: upper-floor share, y: emissive gain (0 disables), z: cool share of the
 * lit, w: ground-floor (shop window) share.
 */
const windowLight = { value: new THREE.Vector4(0, 0, 0, 0) };
/** The shop sign boards' backlight (emissive map) gain. */
const signGlow = { value: 0 };
const shopSignMaterials: THREE.MeshStandardMaterial[] = [];

export function setWindowLights(upperShare: number, groundShare: number, gain: number, coolShare: number): void {
  windowLight.value.set(THREE.MathUtils.clamp(upperShare, 0, 1), Math.max(0, gain),
    THREE.MathUtils.clamp(coolShare, 0, 1), THREE.MathUtils.clamp(groundShare, 0, 1));
}
export function setSignGlow(gain: number): void {
  signGlow.value = Math.max(0, gain);
  for (let i = 0; i < shopSignMaterials.length; i++) shopSignMaterials[i]!.emissiveIntensity = signGlow.value;
}

/** Window centres sit at least 2 cm from the 0.5 m hash grid's cell edges
 * with these offsets (checked over all 112 template windows). */
function litWindows(material: THREE.MeshStandardMaterial, bias: number): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.soraWindowLight = windowLight;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', /* glsl */ `varying vec3 soraWindowLocal; varying vec2 soraWindowUv; flat varying vec3 soraWindowOrigin;
void main() {`)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        soraWindowLocal = transformed; soraWindowUv = uv;
        vec4 soraWindowRoot = vec4(0., 0., 0., 1.);
        #ifdef USE_INSTANCING
          soraWindowRoot = instanceMatrix * soraWindowRoot;
        #endif
        soraWindowOrigin = (modelMatrix * soraWindowRoot).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', /* glsl */ `uniform vec4 soraWindowLight;
varying vec3 soraWindowLocal; varying vec2 soraWindowUv; flat varying vec3 soraWindowOrigin;
float soraWindowHash(vec3 p) {
  p = fract(p * vec3(.1031, .1030, .0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main() {`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        vec3 dpx = dFdx(soraWindowLocal), dpy = dFdy(soraWindowLocal);
        vec2 dux = dFdx(soraWindowUv), duy = dFdy(soraWindowUv);
        float det = dux.x * duy.y - dux.y * duy.x;
        if (soraWindowLight.y > 0. && abs(det) > 1e-12) {
          // The face's edges along U and V (a box face spans UV 0..1).
          vec3 pu = (dpx * duy.y - dpy * dux.y) / det, pv = (dpy * dux.x - dpx * duy.x) / det;
          vec2 size = abs(pv.y) > abs(pu.y) ? vec2(length(pu), length(pv)) : vec2(length(pv), length(pu));
          // Window room backs only: upright, 1.1-2.6 m wide, 1.3-2.05 m tall
          // (not floors, partitions or door backs).
          if (abs(normalize(cross(pu, pv)).y) < .3 && size.x > 1.1 && size.x < 2.6 && size.y > 1.3 && size.y < 2.05) {
            vec3 centre = soraWindowLocal + pu * (.5 - soraWindowUv.x) + pv * (.5 - soraWindowUv.y);
            vec3 seed = floor(centre * 2. + vec3(.05, .48, .695)) * 1.37 + floor(soraWindowOrigin * 4. + .5) * .173;
            float share = centre.y < 2.6 ? soraWindowLight.w : soraWindowLight.x;
            if (soraWindowHash(seed) * ${bias.toFixed(3)} < share) {
              float kind = soraWindowHash(seed + 17.3), level = soraWindowHash(seed + 5.1);
              bool cool = kind < soraWindowLight.z;
              vec3 tint = cool ? (level < .5 ? vec3(.34, .46, 1.) : vec3(.62, .52, 1.))
                : level < .3 ? vec3(1., .72, .38) : vec3(1., .52, .17);
              diffuseColor.rgb *= .35;
              totalEmissiveRadiance += tint * soraWindowLight.y * mix(.75, 1.1, level) * (cool ? .7 : 1.);
            }
          }
        }
      }`);
  };
  material.customProgramCacheKey = () => `sora-lit-windows-v1:${bias}`;
}

function createPalette() {
  const plaster = paintedTexture('plaster');
  const wood = paintedTexture('wood');
  const bark = paintedTexture('bark');
  const leaves = paintedTexture('leaves');
  const palette = {
    plaster: plasterMaterial('#d7d3c8'),
    weatheredPlaster: weatheredPlasterMaterial('#d7d3c8'),
    plasterBlue: plasterMaterial('#abc0c5'),
    plasterSage: plasterMaterial('#bec5ad'),
    plasterWarm: plasterMaterial('#c9bdb5'),
    timber: new THREE.MeshStandardMaterial({ color: '#77736a', ...scannedSurface('japanese_cedar_planks'), roughness: 0.91 }),
    roof: new THREE.MeshStandardMaterial({ color: '#a4aaab', ...scannedSurface('grey_roof_tiles_02'), normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.87 }),
    stone: new THREE.MeshStandardMaterial({ color: '#b1afa4', ...scannedSurface('japanese_stone_wall'), normalScale: new THREE.Vector2(0.65, 0.65), roughness: 0.97 }),
    metal: new THREE.MeshStandardMaterial({ color: '#353b4b', roughness: 0.68, metalness: 0.32 }),
    anodized: new THREE.MeshStandardMaterial({ color: '#858a83', roughness: 0.38, metalness: 0.64 }),
    interior: new THREE.MeshStandardMaterial({ color: '#382e2e', map: wood, roughness: 1 }),
    warm: new THREE.MeshStandardMaterial({ color: '#8e795b', emissive: '#e5aa67', emissiveIntensity: 0.16, roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#a5b5b3', roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }),
    // Amber practical lamp faces: clearly above the bloom threshold (1.6) and
    // on the cutscenes' amber lamp axis rather than a pale cream.
    light: new THREE.MeshStandardMaterial({ color: '#ffe1a1', emissive: '#ff9d45', emissiveIntensity: 5.0, roughness: 0.4 }),
    awning: new THREE.MeshStandardMaterial({ color: '#5e6c64', map: plaster, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: '#6c6255', map: bark, roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#eee9d9', map: leaves, vertexColors: true, roughness: 1 }),
  };
  // Texture dimensions are expressed in meters, not stretched once across an entire wall.
  for (const material of [palette.roof, palette.stone]) material.userData.surfaceMeters = 2;
  palette.timber.userData.surfaceMeters = 1.1;
  // Room backs: the authored "lit" windows (warm) light first.
  litWindows(palette.interior, 1);
  litWindows(palette.warm, .35);
  return palette;
}

let palette: Palette | undefined;
function materials(): Palette { return palette ??= createPalette(); }

/** A single flat chamfer on each edge: 44 triangles, with the original box
 * envelope intact. Use only on exposed concrete/casing, never tiny fittings.
 */
function chamferedBox(width: number, height: number, depth: number, bevel: number): THREE.BufferGeometry {
  const half = [width / 2, height / 2, depth / 2], r = Math.min(bevel, ...half.map(v => v * .45));
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  const face = (points: number[][]) => {
    const vectors = points.map(p => new THREE.Vector3(...p as [number, number, number]));
    const normal = vectors[1]!.clone().sub(vectors[0]!).cross(vectors[2]!.clone().sub(vectors[0]!)).normalize();
    const center = vectors.reduce((sum, v) => sum.add(v), new THREE.Vector3()).multiplyScalar(1 / vectors.length);
    if (normal.dot(center) < 0) { vectors.reverse(); normal.negate(); }
    for (let i = 1; i < vectors.length - 1; i++) for (const p of [vectors[0]!, vectors[i]!, vectors[i + 1]!]) {
      positions.push(...p.toArray()); normals.push(...normal.toArray()); uv.push(0, 0);
    }
  };
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const b = (axis + 1) % 3, c = (axis + 2) % 3;
    face([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
      const p = [0, 0, 0]; p[axis] = sign * half[axis]!; p[b] = x! * (half[b]! - r); p[c] = y! * (half[c]! - r); return p;
    }));
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const c = 3 - a - b;
    face([[0, -1], [1, -1], [1, 1], [0, 1]].map(([edge, end]) => {
      const p = [0, 0, 0]; p[a] = sa * (half[a]! - (edge ? r : 0)); p[b] = sb * (half[b]! - (edge ? 0 : r)); p[c] = end! * (half[c]! - r); return p;
    }));
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const signs = [x, y, z]; face([0, 1, 2].map(axis => half.map((v, i) => signs[i]! * (v - (i === axis ? 0 : r)))));
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return geometry;
}

/** Merge each opaque material into one mesh, including thin details and curved pipework. */
class Batch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3, rotation?: THREE.Euler): void {
    if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    if (position) geometry.translate(position.x, position.y, position.z);
    const meters = material.userData.surfaceMeters as number | undefined;
    if (meters && !geometry.userData.surfaceUv) {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
        const u = nx > nz ? positions.getZ(i) : positions.getX(i);
        const v = ny > Math.max(nx, nz) ? positions.getZ(i) : positions.getY(i);
        uv.setXY(i, u / meters, v / meters);
      }
    }
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const list = this.parts.get(material) ?? [];
    list.push(normalized);
    this.parts.set(material, list);
  }

  box(material: THREE.Material, width: number, height: number, depth: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(width, height, depth), material, new THREE.Vector3(x, y, z), new THREE.Euler(rx, ry, rz));
  }

  chamfer(material: THREE.Material, width: number, height: number, depth: number, x: number, y: number, z: number, bevel = .014): void {
    this.add(chamferedBox(width, height, depth, bevel), material, new THREE.Vector3(x, y, z));
  }

  /** Cast ledge profile: small nose bevel and an actual underside drip groove. */
  ledge(material: THREE.Material, width: number, height: number, depth: number, x: number, y: number, z: number): void {
    const h = height / 2, d = depth / 2, r = Math.min(.018, height / 5), groove = Math.min(.014, height / 7);
    const shape = new THREE.Shape().moveTo(-d + r, h).lineTo(d, h).lineTo(d, -h)
      .lineTo(-d + .085, -h).lineTo(-d + .085, -h + groove).lineTo(-d + .065, -h + groove)
      .lineTo(-d + .065, -h).lineTo(-d + r, -h).lineTo(-d, -h + r).lineTo(-d, h - r).closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(0, 0, -width / 2); geometry.rotateY(-Math.PI / 2);
    this.add(geometry, material, new THREE.Vector3(x, y, z));
  }

  branch(material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, baseRadius: number, tipRadius = baseRadius, sides = 7): void {
    const direction = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, direction.length(), sides, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    this.add(geometry, material, from.clone().add(to).multiplyScalar(0.5));
  }

  cable(material: THREE.Material, points: THREE.Vector3[], radius = 0.022): void {
    this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 4, false), material);
  }

  finish(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false)!;
      for (const part of parts) part.dispose();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

/** A roof is one merged ceramic surface, including the overlapping courses.
 * Each tile samples the interior of a photographed slate, preserving the scan's
 * fine wear without painting a second, incompatible grid over curved geometry.
 */
function roof(batch: Batch, m: Palette, width: number, depth: number, eavesY: number, x = 0, z = 0, rise = 1.3): void {
  const slope = Math.atan2(rise, depth / 2), sin = Math.sin(slope), cos = Math.cos(slope);
  const length = Math.hypot(depth / 2, rise), columns = Math.round(width / .285), rows = Math.ceil(length / .295);
  const tileWidth = width / columns, course = length / rows, profileSegments = 8;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  type V = [number, number, number];
  const unit = (v: V): V => { const d = Math.hypot(...v); return v.map(n => n / d) as V; };
  const patch = (id: number, u: number, v: number): [number, number] =>
    [[.12, .345, .565, .788][id % 4]! + (u - .5) * .055,
      [.05, .23, .42, .6, .78, .95][Math.floor(id / 4) % 6]! + (v - .5) * .046];
  const quad = (points: V[], ns: V[], tex: [number, number][]) => {
    const a = new THREE.Vector3(...points[0]!), b = new THREE.Vector3(...points[1]!), c = new THREE.Vector3(...points[2]!);
    const forward = b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3(...ns[0]!)) >= 0;
    for (const i of forward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      positions.push(...points[i]!); normals.push(...ns[i]!); uvs.push(...tex[i]!);
    }
  };
  const face = (points: V[], normal: V, id: number) => quad(points, points.map(() => normal),
    [patch(id, 0, 0), patch(id, 1, 0), patch(id, 1, 1), patch(id, 0, 1)]);
  // Broad concave pans and a tighter convex roll form each interlocking tile.
  // Smooth analytical normals retain the curved highlight between subdivisions.
  const profile = (u: number) => .026 + .022 * Math.cos(2 * Math.PI * (u - .82)) + .009 * Math.cos(4 * Math.PI * (u - .82));
  const derivative = (u: number) => -Math.PI * (.044 * Math.sin(2 * Math.PI * (u - .82)) + .036 * Math.sin(4 * Math.PI * (u - .82)));
  for (const side of [-1, 1]) {
    // Dark roof boarding sits below the ceramic skin; fascia is behind the open gutter.
    batch.box(m.timber, width, .10, length, x, eavesY + rise / 2 - .045 * cos,
      z + side * (depth / 4 - .045 * sin), side * slope);
    batch.box(m.timber, width + .02, .13, .07, x, eavesY - .065, z + side * (depth / 2 - .07));
    for (const end of [-1, 1]) batch.box(m.timber, .07, .15, length, x + end * (width / 2 - .025),
      eavesY + rise / 2 - .035 * cos, z + side * (depth / 4 - .035 * sin), side * slope);
    const point = (u: number, t: number, height: number): V => [x + u, eavesY + t * sin + height * cos,
      z + side * (depth / 2 - t * cos + height * sin)];
    for (let row = 0; row < rows; row++) {
      const start = row * course, run = Math.min(course + .065, length - start);
      for (let col = 0; col < columns; col++) {
        const left = -width / 2 + col * tileWidth + .0015, span = tileWidth - .003, id = col * 7 + row * 11;
        const at = (u: number, v: number, lower = false): V => point(left + u * span, start + v * run,
          .029 + profile(u) + .022 * (1 - v) - (lower ? .018 : 0));
        for (let segment = 0; segment < profileSegments; segment++) {
          const a = segment / profileSegments, b = (segment + 1) / profileSegments;
          const n = (u: number): V => unit([-derivative(u) / span, cos + sin * .022 / run, side * (sin - cos * .022 / run)]);
          quad([at(a, 0), at(b, 0), at(b, 1), at(a, 1)], [n(a), n(b), n(b), n(a)],
            [patch(id, a, 0), patch(id, b, 0), patch(id, b, 1), patch(id, a, 1)]);
          // The exposed lower lip is real thickness and casts a short course shadow.
          face([at(a, 0), at(b, 0), at(b, 0, true), at(a, 0, true)], [0, -sin, side * cos], id);
          if (row === 0) quad([at(a, 0, true), at(b, 0, true), at(b, 1, true), at(a, 1, true)],
            [n(a), n(b), n(b), n(a)].map(normal => normal.map(v => -v) as V),
            [patch(id, a, 0), patch(id, b, 0), patch(id, b, 1), patch(id, a, 1)]);
        }
        for (const end of [0, 1]) face([at(end, 0), at(end, 1), at(end, 1, true), at(end, 0, true)], [end ? 1 : -1, 0, 0], id);
      }
    }
    // Half-round rainwater channel: open top, inner wall, rolled rim and retaining straps.
    const gutter = new THREE.Shape(), outer = .067, inner = .062;
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * i / 12, px = Math.cos(a) * outer, py = -Math.sin(a) * outer;
      if (i === 0) gutter.moveTo(px, py); else gutter.lineTo(px, py);
    }
    for (let i = 12; i >= 0; i--) { const a = Math.PI * i / 12; gutter.lineTo(Math.cos(a) * inner, -Math.sin(a) * inner); }
    gutter.closePath();
    const channel = new THREE.ExtrudeGeometry(gutter, { depth: width - .06, bevelEnabled: false, curveSegments: 1 });
    channel.translate(0, 0, -(width - .06) / 2); channel.rotateY(Math.PI / 2);
    batch.add(channel, m.metal, new THREE.Vector3(x, eavesY - .026, z + side * (depth / 2 + .018)));
    for (const rim of [-1, 1]) batch.branch(m.metal,
      new THREE.Vector3(x - width / 2 + .03, eavesY - .026, z + side * (depth / 2 + .018) + rim * .065),
      new THREE.Vector3(x + width / 2 - .03, eavesY - .026, z + side * (depth / 2 + .018) + rim * .065), .005, .005, 6);
    for (let bracket = -width / 2 + .23; bracket < width / 2 - .1; bracket += .8) {
      batch.box(m.metal, .022, .018, .14, x + bracket, eavesY - .092, z + side * (depth / 2 + .005));
    }
  }
  // Short, overlapping ridge caps replace the uninterrupted polygonal ridge pipe.
  const caps = Math.ceil(width / .32), capLength = width / caps;
  for (let cap = 0; cap < caps; cap++) {
    const left = -width / 2 + cap * capLength, right = Math.min(width / 2, left + capLength + .018);
    const radius = .112, inner = .092, centerY = eavesY + rise + .116;
    const at = (u: number, angle: number, r: number): V => [x + u, centerY + Math.sin(angle) * r, z + Math.cos(angle) * r];
    // Two bearing courses support the caps and close the gap above the pitched tiles.
    for (const [low, high, halfDepth] of [[.045, .082, .112], [.082, .12, .096]]) {
      for (const side of [-1, 1]) face([[x + left, eavesY + rise + low!, z + side * halfDepth!],
        [x + right, eavesY + rise + low!, z + side * halfDepth!], [x + right, eavesY + rise + high!, z + side * halfDepth!],
        [x + left, eavesY + rise + high!, z + side * halfDepth!]], [0, 0, side], cap);
      face([[x + left, eavesY + rise + high!, z - halfDepth!], [x + right, eavesY + rise + high!, z - halfDepth!],
        [x + right, eavesY + rise + high!, z + halfDepth!], [x + left, eavesY + rise + high!, z + halfDepth!]], [0, 1, 0], cap);
      if (cap === 0 || cap === caps - 1) {
        const end = cap === 0 ? left : right;
        face([[x + end, eavesY + rise + low!, z - halfDepth!], [x + end, eavesY + rise + low!, z + halfDepth!],
          [x + end, eavesY + rise + high!, z + halfDepth!], [x + end, eavesY + rise + high!, z - halfDepth!]], [cap === 0 ? -1 : 1, 0, 0], cap);
      }
    }
    for (let segment = 0; segment < 12; segment++) {
      const a = segment * Math.PI / 12, b = (segment + 1) * Math.PI / 12;
      const na: V = [0, Math.sin(a), Math.cos(a)], nb: V = [0, Math.sin(b), Math.cos(b)];
      quad([at(left, a, radius), at(right, a, radius - .003), at(right, b, radius - .003), at(left, b, radius)],
        [na, na, nb, nb], [patch(cap, 0, 0), patch(cap, 1, 0), patch(cap, 1, 1), patch(cap, 0, 1)]);
      face([at(left, a, radius), at(left, b, radius), at(left, b, inner), at(left, a, inner)], [-1, 0, 0], cap);
      if (cap === caps - 1) face([at(right, a, radius - .003), at(right, b, radius - .003), at(right, b, inner), at(right, a, inner)], [1, 0, 0], cap);
    }
  }
  // Closed gable terminals keep the ridge from reading as an open tube at either end.
  for (const end of [-1, 1]) {
    const terminal = new THREE.Shape().moveTo(-.112, 0);
    for (let i = 1; i <= 12; i++) { const a = Math.PI - i * Math.PI / 12; terminal.lineTo(Math.cos(a) * .112, Math.sin(a) * .112); }
    terminal.closePath();
    const geometry = new THREE.ExtrudeGeometry(terminal, { depth: .026, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .004, bevelThickness: .004 });
    geometry.translate(0, 0, -.013); geometry.rotateY(Math.PI / 2);
    batch.add(geometry, m.roof, new THREE.Vector3(x + end * (width / 2 + .018), eavesY + rise + .116, z));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.userData.surfaceUv = true;
  batch.add(geometry, m.roof);
}

function windowFrame(batch: Batch, m: Palette, x: number, y: number, front: number, width = 1.4, height = 1.65, lit = false, rhythm = 0): void {
  // Room back, jambs, glazing and sill occupy separate depths inside the wall opening.
  batch.box(lit ? m.warm : m.interior, width, height, 0.035, x, y, front + 0.42);
  for (const side of [-1, 1]) {
    batch.box(m.timber, 0.09, height + 0.12, 0.36, x + side * width / 2, y, front + 0.1);
    batch.box(m.timber, width + 0.12, 0.085, 0.35, x, y + side * height / 2, front + 0.1);
    batch.box(m.anodized, .028, height - .07, .045, x + side * (width / 2 - .055), y, front - .075);
    batch.box(m.anodized, width - .09, .023, .062, x, y + side * (height / 2 - .05), front - .068);
  }
  // The two sliding leaves sit on separate tracks. Their meeting stiles and
  // latch now have a real depth change at a passing camera's oblique angle.
  for (const side of [-1, 1]) {
    const z = front + (side < 0 ? -.025 : .025);
    batch.box(m.glass, width / 2 - .065, height - .12, .012, x + side * width / 4, y, z);
    batch.box(m.anodized, .032, height - .07, .054, x + side * .021, y, z - .032);
  }
  if (height > 1.8) batch.box(m.anodized, width - .1, .024, .053, x, y - height * .21, front - .056);
  const latchSide = rhythm % 2 ? -1 : 1, latchX = x + latchSide * .076;
  batch.box(m.metal, .028, .12, .019, latchX, y - .14, front - .089);
  batch.box(m.anodized, .014, .09, .035, latchX, y - .14, front - .11);
  batch.ledge(m.stone, width + 0.27, 0.12, 0.48, x, y - height / 2 - 0.09, front + 0.04);
  // A small number of folded curtain panels gives room depth without adding
  // room lights or repeating a flat bright rectangle in every opening.
  const curtainWidth = width * [.17, .25, .2, .14][rhythm % 4]!, curtainSide = rhythm % 3 === 1 ? 1 : -1;
  const curtainX = x + curtainSide * (width / 2 - curtainWidth / 2 - .025), positions: number[] = [], uv: number[] = [];
  for (let fold = 0; fold < 6; fold++) {
    const x0 = curtainX - curtainWidth / 2 + fold * curtainWidth / 6, x1 = x0 + curtainWidth / 6;
    const z0 = front + .28 + fold % 2 * .045, z1 = front + .28 + (fold + 1) % 2 * .045;
    for (const p of [[x0, y - height / 2 + .05, z0], [x0, y + height / 2 - .05, z0], [x1, y + height / 2 - .05, z1],
      [x0, y - height / 2 + .05, z0], [x1, y + height / 2 - .05, z1], [x1, y - height / 2 + .05, z1]]) { positions.push(...p); uv.push(0, 0); }
  }
  const curtain = new THREE.BufferGeometry(); curtain.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  curtain.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); curtain.computeVertexNormals(); batch.add(curtain, m.plaster);
  batch.box(m.timber, width * 0.78, 0.055, 0.25, x, y - height * 0.32, front + 0.28);
}

/** Compact side-window recess, rotated into a genuinely open side wall. */
function sideWindow(batch: Batch, m: Palette, side: number, wallX: number, y: number, z: number, width: number, height: number): void {
  const detail = new Batch();
  detail.box(m.interior, width, height, .025, 0, 0, .36);
  for (const sign of [-1, 1]) {
    detail.box(m.timber, .075, height + .1, .3, sign * width / 2, 0, .1);
    detail.box(m.anodized, width + .075, .05, .31, 0, sign * height / 2, .1);
    detail.box(m.glass, width / 2 - .065, height - .09, .012, sign * width / 4, 0, sign * .02);
  }
  detail.box(m.anodized, .035, height, .085, 0, 0, -.03);
  detail.ledge(m.stone, width + .2, .1, .38, 0, -height / 2 - .07, .015);
  const group = detail.finish('apartment-side-window');
  for (const mesh of group.children as THREE.Mesh[]) {
    batch.add(mesh.geometry.clone(), mesh.material as THREE.Material, new THREE.Vector3(wallX, y, z), new THREE.Euler(0, -side * Math.PI / 2, 0));
    mesh.geometry.dispose();
  }
}

function entranceDoor(batch: Batch, m: Palette, x: number, floor: number, front: number, width: number, height: number): void {
  const y = floor + height / 2;
  batch.box(m.interior, width, height, .035, x, y, front + .4);
  for (const side of [-1, 1]) {
    batch.chamfer(m.anodized, .075, height + .1, .16, x + side * width / 2, y, front + .015, .009);
    batch.box(m.glass, width / 2 - .1, height - .17, .018, x + side * width / 4, y, front + .04);
    batch.box(m.anodized, .036, height - .03, .075, x + side * .022, y, front - .015);
    // Paired pull handles stand off the glass on two visible end mounts.
    for (const dy of [-.14, .14]) batch.box(m.anodized, .028, .024, .08, x + side * .12, floor + 1.07 + dy, front - .055);
    batch.box(m.anodized, .028, .31, .026, x + side * .12, floor + 1.07, front - .103);
    batch.box(m.metal, .24, .065, .09, x + side * width * .31, floor + height - .1, front - .01);
  }
  batch.chamfer(m.anodized, width + .08, .085, .18, x, floor + height, front + .015, .009);
  batch.ledge(m.stone, width + .12, .07, .34, x, floor - .035, front + .08);
  batch.box(m.anodized, .105, .23, .055, x + width / 2 + .13, floor + 1.15, front - .035);
  for (let button = 0; button < 3; button++) batch.box(m.metal, .055, .018, .009, x + width / 2 + .13, floor + 1.12 + button * .035, front - .067);
}

function balcony(batch: Batch, m: Palette, x: number, floor: number, front: number, width: number): void {
  batch.ledge(m.plaster, width, 0.17, 1.05, x, floor, front - 0.37);
  batch.box(m.metal, width, 0.06, 0.07, x, floor + 0.95, front - 0.85);
  batch.box(m.metal, width, 0.035, 0.05, x, floor + 0.27, front - 0.85);
  for (let offset = -width / 2; offset <= width / 2 + 0.01; offset += 0.22) batch.box(m.metal, 0.027, 0.92, 0.035, x + offset, floor + 0.47, front - 0.85);
  for (const side of [-1, 1]) batch.box(m.metal, 0.055, 0.9, 0.92, x + side * width / 2, floor + 0.48, front - 0.38);
}

function compressor(batch: Batch, m: Palette, x: number, y: number, front: number): void {
  batch.chamfer(m.plaster, 0.9, 0.62, 0.36, x, y, front - 0.19, .017);
  batch.add(new THREE.CylinderGeometry(0.23, 0.23, 0.022, 20), m.metal, new THREE.Vector3(x - 0.08, y, front - 0.385), new THREE.Euler(Math.PI / 2, 0, 0));
  for (let rib = -3; rib <= 3; rib++) batch.box(m.plaster, 0.44, 0.021, 0.035, x - 0.08, y + rib * 0.058, front - 0.415);
  for (const side of [-1, 1]) {
    batch.box(m.metal, .085, .07, .27, x + side * .31, y - .345, front - .15);
    batch.box(m.anodized, .024, .42, .02, x + side * .38, y, front - .38);
  }
  batch.cable(m.metal, [new THREE.Vector3(x + 0.3, y - 0.1, front - 0.16), new THREE.Vector3(x + 0.59, y - 0.15, front - 0.08), new THREE.Vector3(x + 0.59, y - 0.82, front)], 0.025);
}

function buildBuilding(variant: number): THREE.Group {
  const m = materials(), batch = new Batch();
  const width = [8.8, 7.9, 10.2, 9.3][variant]!;
  const height = [6.65, 7.15, 6.35, 7.35][variant]!;
  const depth = [6, 6.6, 6.1, 6.3][variant]!;
  const front = -depth / 2;
  const wall = [m.weatheredPlaster, m.plasterBlue, m.plasterSage, m.plasterWarm][variant]!;
  const floor = 3.18, windowY = height - 1.53, windowH = 1.72;
  const windowW = width * 0.19;
  const windows = [-width * 0.31, 0, width * 0.31];
  // A structural shell leaves genuine open frontage and room recesses instead of overlaying windows on a solid cube.
  batch.box(m.stone, width + 0.12, 0.32, depth + 0.1, 0, 0.16, 0);
  // Driving past a frontage exposes its side elevation. Give both sides actual
  // window openings rather than a blank full-height plaster rectangle.
  const sideWindowWidth = 1.3, sideWindowHeight = 1.54;
  const sideWindowBottom = windowY - sideWindowHeight / 2, sideWindowTop = windowY + sideWindowHeight / 2;
  for (const side of [-1, 1]) {
    const sideX = side * (width / 2 - 0.12);
    batch.box(wall, 0.24, sideWindowBottom - 0.3, depth, sideX, (sideWindowBottom + 0.3) / 2, 0);
    batch.box(wall, 0.24, height - sideWindowTop, depth, sideX, (height + sideWindowTop) / 2, 0);
    let edge = -depth / 2;
    for (const [index, z] of [-depth * 0.235, depth * 0.235].entries()) {
      const left = z - sideWindowWidth / 2;
      batch.box(wall, 0.24, sideWindowHeight, left - edge, sideX, windowY, (left + edge) / 2);
      const recess = new Batch();
      windowFrame(recess, m, 0, windowY, 0, sideWindowWidth, sideWindowHeight, (variant + index + (side > 0 ? 1 : 0)) % 6 === 0, variant + index);
      const detail = recess.finish('side-window-detail');
      for (const part of detail.children as THREE.Mesh[]) {
        batch.add(part.geometry.clone(), part.material as THREE.Material,
          new THREE.Vector3(side * width / 2, 0, z), new THREE.Euler(0, -side * Math.PI / 2, 0));
        part.geometry.dispose();
      }
      edge = z + sideWindowWidth / 2;
    }
    batch.box(wall, 0.24, sideWindowHeight, depth / 2 - edge, sideX, windowY, (edge + depth / 2) / 2);
    // External drain and its elbows break the long flank below the eaves.
    batch.branch(m.metal, new THREE.Vector3(side * (width / 2 + 0.065), 0.4, depth * 0.33),
      new THREE.Vector3(side * (width / 2 + 0.065), height - 0.3, depth * 0.33), 0.045, 0.045, 8);
    for (const y of [0.95, floor + 0.1, height - 0.7]) batch.box(m.metal, 0.17, 0.055, 0.14, side * (width / 2 + 0.025), y, depth * 0.33);
  }
  batch.box(wall, width, height, 0.22, 0, height / 2, depth / 2 - 0.11);
  batch.box(m.interior, width - 0.3, 0.16, depth - 0.2, 0, floor, 0);
  batch.box(m.interior, width - 0.35, 2.68, 0.12, 0, 1.66, front + 1.4);
  const lowerEdge = windowY - windowH / 2, upperEdge = windowY + windowH / 2;
  batch.box(wall, width, lowerEdge - floor, 0.28, 0, (floor + lowerEdge) / 2, front + 0.14);
  batch.box(wall, width, height - upperEdge, 0.28, 0, (height + upperEdge) / 2, front + 0.14);
  let edge = -width / 2;
  for (const [index, x] of windows.entries()) {
    const left = x - windowW / 2;
    batch.box(wall, left - edge, windowH, 0.28, (edge + left) / 2, windowY, front + 0.14);
    windowFrame(batch, m, x, windowY, front, windowW, windowH, (variant + index) % 4 === 1, variant + index);
    edge = x + windowW / 2;
  }
  batch.box(wall, width / 2 - edge, windowH, 0.28, (edge + width / 2) / 2, windowY, front + 0.14);
  batch.box(m.timber, width + 0.16, 0.2, 0.22, 0, floor + 0.1, front - 0.015);
  batch.box(m.timber, width + 0.16, 0.15, 0.2, 0, height - 0.08, front - 0.04);
  // Broad timber siding and masonry plinths give side elevations believable material scale.
  for (const side of [-1, 1]) {
    batch.box(m.timber, 0.06, 1.32, depth - 0.12, side * (width / 2 + 0.025), 0.95, 0);
    batch.box(m.metal, 0.09, 0.07, depth + 0.12, side * (width / 2 + 0.04), 1.67, 0);
    batch.box(wall, 0.1, 0.19, depth + 0.1, side * (width / 2 + 0.04), floor + 0.02, 0);
  }
  for (const x of [-width / 2 + 0.07, width / 2 - 0.07]) batch.box(m.timber, 0.18, height, 0.19, x, height / 2, front - 0.045);

  const garageX = -width * 0.24, cafeX = width * 0.25;
  // A dedicated 3.2 m garage opening receives the detailed shutter inside its jambs.
  for (const side of [-1, 1]) batch.box(wall, 0.2, 2.84, 0.48, garageX + side * 1.62, 1.72, front + 0.12);
  batch.chamfer(wall, 3.45, 0.25, 0.5, garageX, 3.05, front + 0.1, .012);
  batch.ledge(m.stone, 3.45, 0.13, 0.72, garageX, 0.325, front - 0.13);
  if (variant !== 0) {
    batch.box(m.timber, 2.6, 0.1, 0.48, garageX, 1.04, front + 0.95);
    batch.box(m.metal, 0.84, 0.77, 0.42, garageX + 0.7, 0.72, front + 0.9);
    for (let shelf = 0; shelf < 3; shelf++) batch.box(m.timber, 1.25, 0.075, 0.3, garageX - 0.58, 1.45 + shelf * 0.42, front + 1.13);
  }
  // Offset entry, shop window and a real tiled doorstep are separate from the garage bay.
  batch.box(wall, width * 0.44, 0.62, 0.3, cafeX, 0.62, front + 0.15);
  windowFrame(batch, m, cafeX + 0.38, 1.67, front, 1.6, 1.52, variant === 0, variant + 2);
  batch.box(m.timber, 0.8, 2.46, 0.18, cafeX - 1.05, 1.56, front + 0.055);
  batch.box(m.glass, 0.61, 1.48, 0.015, cafeX - 1.05, 1.84, front - 0.048);
  batch.box(m.metal, 0.035, 0.2, 0.06, cafeX - 0.79, 1.45, front - 0.072);
  for (const side of [-1, 1]) batch.box(m.timber, .055, 2.51, .065, cafeX - 1.05 + side * .425, 1.56, front - .055);
  batch.box(m.anodized, .034, .23, .027, cafeX - .79, 1.45, front - .114);
  for (const y of [.75, 2.32]) batch.box(m.anodized, .047, .075, .035, cafeX - 1.43, y, front - .067);
  batch.box(m.metal, .18, .056, .088, cafeX - 1.05, 2.7, front - .075);
  batch.ledge(m.stone, 1.03, 0.2, 0.7, cafeX - 1.05, 0.22, front - 0.24);
  const canopyMaterial = variant > 1 ? wall : m.awning;
  batch.box(canopyMaterial, width * 0.45, variant > 1 ? 0.2 : 0.055, 1.4, cafeX, 3.07, front - 0.46, -0.12);
  if (variant < 2) batch.box(m.awning, width * 0.45, 0.22, 0.06, cafeX, 2.88, front - 1.12);
  for (const x of [garageX, cafeX - 0.9]) {
    batch.box(m.metal, 0.35, 0.12, 0.28, x, 2.86, front - 0.27);
    batch.box(m.light, 0.25, 0.025, 0.19, x, 2.79, front - 0.27);
  }

  if (variant === 3) {
    // Postwar concrete shop-house: flat parapet, setback service room and a small roof terrace.
    batch.chamfer(wall, width + 0.35, 0.2, depth + 0.35, 0, height, 0, .022);
    for (const side of [-1, 1]) batch.chamfer(wall, width + 0.2, 0.54, 0.16, 0, height + 0.26, side * (depth / 2 + 0.07), .012);
    batch.box(wall, 2.5, 1.55, 2.3, width * 0.21, height + 0.88, 0.75);
    batch.box(m.metal, 2.68, 0.13, 2.45, width * 0.21, height + 1.68, 0.75);
    balcony(batch, m, -width * 0.17, floor + 0.2, front, width * 0.56);
  } else {
    const rise = variant === 1 ? 1.8 : 1.3;
    const gable = new THREE.Shape().moveTo(-depth / 2, 0).lineTo(depth / 2, 0).lineTo(0, rise).closePath();
    batch.add(new THREE.ExtrudeGeometry(gable, { depth: width, bevelEnabled: false }), wall, new THREE.Vector3(-width / 2, height, 0), new THREE.Euler(0, Math.PI / 2, 0));
    roof(batch, m, width + 0.75, depth + 0.75, height, 0, 0, rise);
    if (variant === 1) {
      balcony(batch, m, 0, floor + 0.2, front, width * 0.84);
      for (let slat = 0; slat < 15; slat++) batch.box(m.timber, 0.045, 1.8, 0.1, windows[0]! - windowW / 2 + slat * windowW / 14, windowY, front - 0.21);
    }
    if (variant === 2) {
      // Lower side workshop mass breaks the repeated full-height box silhouette.
      batch.box(m.timber, 2.15, 2.85, 3.8, width / 2 + 0.77, 1.58, 0.95);
      roof(batch, m, 2.48, 4.1, 3.03, width / 2 + 0.77, 0.95, 0.55);
    }
  }
  compressor(batch, m, width * 0.36, floor + 0.52, front);
  batch.cable(m.metal, [new THREE.Vector3(-width / 2, height - 0.38, front - 0.16), new THREE.Vector3(-0.6, height - 0.73, front - 0.24), new THREE.Vector3(width / 2, height - 0.5, front - 0.16)], 0.017);
  const group = batch.finish(`detailed-neighborhood-${variant}`);
  // Mount the sign in front of the beam instead of burying its lower half inside it.
  group.userData.flagPosition = [garageX, 3.43, front - 0.19];
  group.userData.flagWidth = 2.85;
  group.userData.shopLightPosition = [cafeX - 0.9, 2.75, front - 0.29];
  group.userData.shopLightTarget = [cafeX - 0.9, 0.3, front - 1.1];
  group.userData.shutterPosition = [garageX, 0.39, front + 0.12];
  group.userData.shutterScale = [1, 0.86, 1];
  group.userData.pipesPosition = [width / 2 - 0.25, 0.32, front - 0.11];
  group.userData.pipesScale = [1, (height - 0.38) / 6, 1];
  group.userData.front = front;
  group.userData.openGarage = variant === 0;
  group.userData.workshopPosition = [garageX, 0.32, front + 0.79];
  group.userData.vendingPosition = [width / 2 - 0.75, 0, front - 0.44];
  group.userData.garageLightPosition = [garageX, 2.75, front - 0.12];
  group.userData.garageLightTarget = [garageX, 1, front + 0.85];
  return group;
}

const apartmentTemplates = new Map<number, THREE.Group>();

/** Two shared apartment blocks for background street frontage, each with actual recessed balconies. */
export function createApartment(seed: number): THREE.Group {
  const variant = Math.abs(Math.floor(seed)) % 2;
  let template = apartmentTemplates.get(variant);
  if (!template) {
    const m = materials(), batch = new Batch();
    const width = variant ? 15 : 12.8, depth = variant ? 10 : 8.8, floors = variant ? 6 : 4;
    const storey = 3.05, height = floors * storey, front = -depth / 2;
    const wall = variant ? m.plaster : m.plasterBlue;
    batch.box(m.stone, width + 0.25, 0.4, depth + 0.2, 0, 0.2, 0);
    // The occupied volume starts behind the window backs. Keeping it at the
    // balcony glazing plane would fill every recess with an opaque plaster face.
    batch.box(wall, width, height, .24, 0, height / 2, depth / 2 - .12);
    for (const side of [-1, 1]) batch.box(wall, 0.28, height, 1.45, side * (width / 2 - 0.14), height / 2, front + 0.7);
    for (let floor = 0; floor < floors; floor++) {
      const y = 0.4 + floor * storey;
      batch.ledge(wall, width + 0.4, 0.17, 1.65, 0, y, front + 0.57);
      batch.box(m.interior, width - .4, .13, depth - 2.12, 0, y - .01, .95);
      const windowFront = front + 1.3, windowWidth = width * 0.16;
      const lowerWindowEdge = 1.48 - 1.95 / 2, upperWindowEdge = 1.48 + 1.95 / 2;
      const entryBay = variant ? 2 : 1, entryX = -width * .375 + entryBay * width * .25;
      if (floor === 0) {
        const left = entryX - windowWidth / 2, right = entryX + windowWidth / 2;
        batch.box(wall, left + width / 2, lowerWindowEdge, .24, (left - width / 2) / 2, y + lowerWindowEdge / 2, windowFront + .12);
        batch.box(wall, width / 2 - right, lowerWindowEdge, .24, (right + width / 2) / 2, y + lowerWindowEdge / 2, windowFront + .12);
      } else batch.box(wall, width, lowerWindowEdge, 0.24, 0, y + lowerWindowEdge / 2, windowFront + 0.12);
      batch.box(wall, width, storey - upperWindowEdge, 0.24, 0, y + (upperWindowEdge + storey) / 2, windowFront + 0.12);
      let windowEdge = -width / 2;
      for (let bay = 0; bay < 4; bay++) {
        const x = -width * 0.375 + bay * width * 0.25;
        const left = x - windowWidth / 2;
        batch.box(wall, left - windowEdge, 1.95, 0.24, (left + windowEdge) / 2, y + 1.48, windowFront + 0.12);
        if (floor === 0 && bay === entryBay) {
          entranceDoor(batch, m, x, y + .09, windowFront, windowWidth, upperWindowEdge - .09);
          for (let step = 0; step < 3; step++) batch.chamfer(m.stone, windowWidth + .22 - step * .055, .16, .28,
            x, .08 + step * .16, front - .855 + step * .23, .013);
        } else windowFrame(batch, m, x, y + 1.48, windowFront, windowWidth, 1.95, (bay + floor + variant) % 7 === 0, floor * 2 + bay + variant);
        windowEdge = x + windowWidth / 2;
        if (floor > 0) {
          batch.chamfer(wall, width * 0.245, 0.79, 0.12, x, y + 0.54, front - 0.17, .011);
          batch.box(m.anodized, width * .242, .023, .145, x, y + .946, front - .17);
          batch.box(m.metal, width * 0.245, 0.05, 0.07, x, y + 1.1, front - 0.18);
          for (let bar = 0; bar < 7; bar++) batch.box(m.metal, 0.025, 0.28, 0.028, x - width * 0.1 + bar * width / 30, y + 0.94, front - 0.18);
        }
        if (bay < 3) batch.chamfer(wall, 0.17, 2.5, 1.35, x + width * 0.125, y + 1.3, front + 0.61, .011);
        if ((bay + floor) % 3 === 1 && !(floor === 0 && bay === entryBay)) compressor(batch, m, x - width * 0.072, y + 0.59, front + 0.78);
      }
      batch.box(wall, width / 2 - windowEdge, 1.95, 0.24, (windowEdge + width / 2) / 2, y + 1.48, windowFront + 0.12);
      // Build the side shell around the two openings. Glass no longer lies on
      // an unbroken opaque box: jambs and a recessed room back remain visible.
      const sideBottom = .75, sideTop = 2.35, shellStart = front + 1.45, shellEnd = depth / 2;
      const sideTopHeight = Math.max(.05, Math.min(storey, height - y) - sideTop);
      for (const side of [-1, 1]) {
        const wallX = side * (width / 2 - .12);
        batch.box(wall, .24, sideBottom, shellEnd - shellStart, wallX, y + sideBottom / 2, (shellStart + shellEnd) / 2);
        batch.box(wall, .24, sideTopHeight, shellEnd - shellStart, wallX, y + sideTop + sideTopHeight / 2, (shellStart + shellEnd) / 2);
        let edge = shellStart;
        for (const z of [-depth * .17, depth * .2]) {
          const left = z - .66;
          batch.box(wall, .24, 1.6, left - edge, wallX, y + 1.55, (left + edge) / 2);
          sideWindow(batch, m, side, side * width / 2, y + 1.55, z, 1.32, 1.6);
          edge = z + .66;
        }
        batch.box(wall, .24, 1.6, shellEnd - edge, wallX, y + 1.55, (shellEnd + edge) / 2);
      }
    }
    batch.chamfer(wall, width + 0.45, 0.22, depth + 0.4, 0, height + 0.15, 0, .024);
    for (const side of [-1, 1]) {
      batch.chamfer(wall, width + 0.3, 0.6, 0.19, 0, height + 0.5, side * depth / 2, .014);
      batch.chamfer(wall, 0.19, 0.6, depth, side * width / 2, height + 0.5, 0, .014);
      batch.ledge(wall, width + .33, .065, .27, 0, height + .8325, side * depth / 2);
      batch.chamfer(wall, .27, .065, depth - .05, side * width / 2, height + .8325, 0, .011);
      // Ordinary rainwater stacks and stand-off clips break the balcony ends.
      const pipeX = side * (width / 2 + .055), pipeZ = front + .5;
      batch.branch(m.anodized, new THREE.Vector3(pipeX, .35, pipeZ), new THREE.Vector3(pipeX, height + .34, pipeZ), .045, .045, 8);
      for (let floor = 0; floor < floors; floor += 2) batch.box(m.metal, .15, .045, .15, pipeX - side * .025, .9 + floor * storey, pipeZ + .015);
      batch.branch(m.anodized, new THREE.Vector3(pipeX, .35, pipeZ), new THREE.Vector3(pipeX, .22, pipeZ + .22), .045, .045, 8);
    }
    batch.box(wall, 3.1, 2.5, 3.6, -width * 0.25, height + 1.35, 0.7);
    batch.box(m.metal, 3.3, 0.15, 3.85, -width * 0.25, height + 2.62, 0.7);
    batch.box(m.metal, 1.0, 2.03, 0.08, -width * 0.25, height + 1.18, -1.15);
    batch.add(new THREE.CylinderGeometry(1.05, 1.05, 1.8, 24), m.plaster, new THREE.Vector3(width * 0.25, height + 1.55, 1.3));
    batch.add(new THREE.SphereGeometry(1.05, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.plaster, new THREE.Vector3(width * 0.25, height + 2.45, 1.3));
    for (const side of [-1, 1]) batch.box(m.metal, 0.15, 0.55, 2.2, width * 0.25 + side * 0.75, height + 0.4, 1.3);
    template = batch.finish(`detailed-apartment-${variant}`);
    template.userData.height = height + 3.5;
    apartmentTemplates.set(variant, template);
  }
  return template.clone(true);
}

const buildingTemplates = new Map<number, THREE.Group>();
const treeTemplates = new Map<boolean, THREE.Group>();
let lampTemplate: THREE.Group | undefined;
let signTemplate: THREE.Group | undefined;
const flagMaterials = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
const shopMaterials = new Map<number, THREE.MeshStandardMaterial>();

/** Original period shop typography on a physical board; the scan and scene lighting remain visible. */
function shopMaterial(variant: number): THREE.MeshStandardMaterial {
  const cached = shopMaterials.get(variant); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const signs = [
    { title: 'SORA 自動車', subtitle: '整備・板金・塗装', color: '#294856', ink: '#eee3c8', serif: false },
    { title: '純喫茶 夕凪', subtitle: 'COFFEE  &  TEA', color: '#d6c7a6', ink: '#543938', serif: true },
    { title: '森田商店', subtitle: '日用品・食料品', color: '#587064', ink: '#eee6cf', serif: false },
    { title: '朝日 電器', subtitle: 'ラジオ・テレビ・修理', color: '#bcc3bf', ink: '#354751', serif: false },
  ];
  const sign = signs[variant]!;
  const draw = (): void => {
    context.fillStyle = sign.color; context.fillRect(0, 0, 1024, 256);
    context.strokeStyle = sign.ink; context.globalAlpha = 0.68; context.lineWidth = 3;
    context.strokeRect(14, 13, 996, 230); context.globalAlpha = 1;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = sign.ink;
    context.font = `600 104px ${sign.serif ? '"Hiragino Mincho ProN", SoraJP, "Noto Sans JP", serif' : '"Hiragino Kaku Gothic ProN", SoraJP, "Noto Sans JP", sans-serif'}`;
    context.fillText(sign.title, variant === 0 ? 548 : 512, 98, variant === 0 ? 770 : 920);
    context.font = '500 39px "Hiragino Kaku Gothic ProN", SoraJP, "Noto Sans JP", sans-serif';
    context.fillText(sign.subtitle, 512, 195, 900);
    // Small worn marks and edge dust belong to the enamel board, not to the final pixel finish.
    const rng = random(1926 + variant * 187);
    for (let i = 0; i < 650; i++) {
      context.fillStyle = i % 3 ? 'rgba(14,23,29,.06)' : 'rgba(247,234,201,.12)';
      context.fillRect(rng() * 1024, rng() * 256, 0.5 + rng() * 2, 0.5 + rng() * 2);
    }
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  texture.name = `original-shop-sign-${variant}`;
  // Canvas pixels do not refresh when a webfont arrives. SoraJP is the bundled
  // Noto Sans JP face, including on systems without the preferred native fonts.
  void Promise.all([
    document.fonts.load('600 104px SoraJP', sign.title),
    document.fonts.load('500 39px SoraJP', sign.subtitle),
  ]).catch(() => []).then(() => document.fonts.ready).then(() => {
    draw(); texture.needsUpdate = true;
  });
  // Backlit at night (R3): the emissive map is the board's own print, its
  // gain set per mood (setSignGlow).
  const material = new THREE.MeshStandardMaterial({ map: texture, color: '#e9e5dc', roughness: 0.8, metalness: 0.12,
    emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: signGlow.value });
  material.name = `period-shop-sign-${variant}`;
  shopSignMaterials.push(material);
  shopMaterials.set(variant, material); return material;
}

function flagMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  let material = flagMaterials.get(texture);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map: texture, color: '#f0e5d1', roughness: 0.94 });
    flagMaterials.set(texture, material);
  }
  return material;
}

/** Four shared architectural templates; clones share all geometry and materials. */
export function createBuilding(seed: number, flag: THREE.Texture): THREE.Group {
  const variant = Math.abs(Math.floor(seed)) % 4;
  let template = buildingTemplates.get(variant);
  if (!template) {
    template = buildBuilding(variant);
    buildingTemplates.set(variant, template);
  }
  const group = template.clone();
  const panel = new THREE.Mesh(signPanelGeometry, shopMaterial(variant));
  panel.position.fromArray(group.userData.flagPosition as number[]);
  panel.scale.set(group.userData.flagWidth as number, 0.58, 0.08);
  panel.castShadow = panel.receiveShadow = true;
  group.add(panel);
  if (variant === 0) {
    const badge = new THREE.Mesh(signPanelGeometry, flagMaterial(flag));
    badge.position.copy(panel.position).add(new THREE.Vector3(-1.13, 0.06, -0.053));
    badge.scale.set(0.27, 0.19, 0.025); badge.castShadow = badge.receiveShadow = true;
    group.add(badge);
  }
  return group;
}

/** An oval, closed leaf volume, with a gently raised vein and a darker reverse. */
function leafGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -0.22, 0.23, 0, -0.35, 0.49, 0,
    -0.23, 0.76, -0.01, 0, 1, -0.04, 0.23, 0.76, -0.01,
    0.35, 0.49, 0, 0.22, 0.23, 0, 0, 0.48, 0.045, 0, 0.48, -0.02,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0.18, 0.23, 0, 0.49, 0.17, 0.76, 0.5, 1, 0.83, 0.76, 1, 0.49, 0.82, 0.23, 0.5, 0.48, 0.5, 0.48], 2));
  const indices: number[] = [];
  for (let i = 0; i < 8; i++) indices.push(i, (i + 1) % 8, 8, i, 9, (i + 1) % 8);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildTree(sakura: boolean): THREE.Group {
  const m = materials();
  const batch = new Batch();
  const rng = random(sakura ? 7329 : 91273);
  const baseLeaf = leafGeometry();
  const leaves: THREE.BufferGeometry[] = [];
  const shadedColor = new THREE.Color(sakura ? '#795873' : '#244548');
  const litColor = new THREE.Color(sakura ? '#d1a3ae' : '#6a8054');
  const trunk = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.13, 1.9, -0.08), new THREE.Vector3(-0.08, 3.45, 0.05), new THREE.Vector3(0.13, 5.28, 0)];
  for (let i = 0; i < trunk.length - 1; i++) batch.branch(m.bark, trunk[i], trunk[i + 1], 0.24 - i * 0.052, 0.2 - i * 0.06, 9);
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2;
    batch.branch(m.bark, new THREE.Vector3(0, 0.31, 0), new THREE.Vector3(Math.cos(angle) * 0.6, 0.03, Math.sin(angle) * 0.52), 0.12, 0.025, 6);
  }
  for (let limb = 0; limb < 19; limb++) {
    const angle = limb * 2.39996 + rng() * 0.35;
    const tier = limb / 18;
    const radius = 1.25 + Math.sin(tier * Math.PI) * 0.85;
    const origin = new THREE.Vector3(0.06, 2.65 + tier * 3.55, 0);
    const elbow = new THREE.Vector3(Math.cos(angle) * radius * 0.56, origin.y + 0.45 + rng() * 0.25, Math.sin(angle) * radius * 0.56);
    const end = new THREE.Vector3(Math.cos(angle) * radius, origin.y + 0.9, Math.sin(angle) * radius);
    // Broad pigment shifts belong to a crown spray, not to randomly alternating leaves.
    const sprayColor = shadedColor.clone().lerp(litColor, THREE.MathUtils.clamp(0.28 + tier * 0.47 - Math.cos(angle) * 0.17, 0, 1));
    batch.branch(m.bark, origin, elbow, 0.087 - tier * 0.047, 0.045 - tier * 0.02, 7);
    batch.branch(m.bark, elbow, end, 0.046 - tier * 0.025, 0.014, 6);
    for (let twig = 0; twig < 3; twig++) {
      const twigAngle = angle + (twig - 1) * 0.83;
      const tip = end.clone().add(new THREE.Vector3(Math.cos(twigAngle) * 0.49, (twig - 0.5) * 0.25, Math.sin(twigAngle) * 0.49));
      batch.branch(m.bark, elbow, tip, 0.022, 0.005, 4);
      for (let leaf = 0; leaf < 24; leaf++) {
        const azimuth = rng() * Math.PI * 2;
        const innerLeaf = leaf < 9;
        const distance = Math.sqrt(rng()) * (innerLeaf ? 0.23 : 0.49);
        const offset = new THREE.Vector3(Math.cos(azimuth) * distance, (rng() - 0.3) * 0.43, Math.sin(azimuth) * distance);
        const position = tip.clone().add(offset);
        const scale = innerLeaf ? 0.46 + rng() * 0.12 : 0.21 + rng() * 0.16;
        const geometry = baseLeaf.clone();
        const direction = offset.clone().add(new THREE.Vector3(Math.cos(angle) * 0.25, 0.1 + rng() * 0.35, Math.sin(angle) * 0.25)).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2));
        geometry.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(scale, scale * (sakura ? 0.7 : 1.1), scale)));
        const color = sprayColor.clone().multiplyScalar((innerLeaf ? 0.69 : 0.96) + rng() * 0.12 + Math.max(0, offset.y) * 0.3);
        const colorData: number[] = [];
        const normal = new THREE.Vector3(position.x * 0.18, 0.85 + (position.y - 5.3) * 0.1, position.z * 0.18).normalize();
        const normals = geometry.getAttribute('normal');
        for (let vertex = 0; vertex < 10; vertex++) {
          const shading = vertex === 9 ? 0.9 : vertex === 8 ? 1.025 : 1;
          colorData.push(color.r * shading, color.g * shading, color.b * shading);
          // Bent foliage normals shade each closed leaf as part of its larger crown.
          const surfaceNormal = new THREE.Vector3().fromBufferAttribute(normals, vertex).multiplyScalar(0.42).addScaledVector(normal, 0.58).normalize();
          normals.setXYZ(vertex, surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorData, 3));
        leaves.push(geometry);
      }
    }
  }
  baseLeaf.dispose();
  const foliage = mergeGeometries(leaves, false)!;
  for (const geometry of leaves) geometry.dispose();
  const group = batch.finish(sakura ? 'painted-sakura' : 'painted-broadleaf');
  const mesh = new THREE.Mesh(foliage, m.foliage);
  mesh.castShadow = true;
  // Tiny self-shadow fragments make a moving canopy flicker; its painted underside is
  // already expressed in the vertex colors, while it still casts a full world shadow.
  mesh.receiveShadow = false;
  group.add(mesh);
  return group;
}

/** Closed leaves and branching wood are real geometry from every viewing angle. */
export function createTree(seed: number, sakura: boolean): THREE.Group {
  let template = treeTemplates.get(sakura);
  if (!template) { template = buildTree(sakura); treeTemplates.set(sakura, template); }
  const group = template.clone();
  const rng = random(seed);
  const size = 0.92 + rng() * 0.16;
  group.rotation.y = rng() * Math.PI * 2;
  group.scale.set(size * 0.72, 0.95 + rng() * 0.1, size * 0.72);
  return group;
}

export function createStreetLamp(): THREE.Group {
  if (!lampTemplate) {
    const m = materials();
    const batch = new Batch();
    batch.add(new THREE.CylinderGeometry(0.13, 0.21, 0.55, 8), m.metal, new THREE.Vector3(0, 0.275, 0));
    batch.branch(m.metal, new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0, 6.4, 0), 0.085, 0.055, 8);
    batch.cable(m.metal, [new THREE.Vector3(0, 6.25, 0), new THREE.Vector3(0, 6.8, -0.25), new THREE.Vector3(0, 6.93, -0.9), new THREE.Vector3(0, 6.76, -1.32)], 0.057);
    batch.box(m.metal, 0.42, 0.17, 0.72, 0, 6.71, -1.28);
    batch.box(m.light, 0.33, 0.035, 0.58, 0, 6.615, -1.28);
    lampTemplate = batch.finish('painted-street-lamp');
    lampTemplate.userData.lightPosition = [0, 6.58, -1.28];
  }
  return lampTemplate.clone();
}

const signPanelGeometry = new THREE.BoxGeometry(1, 1, 1);

/** Solid roadside hazard sign with a post, backing, and raised rectangular face. */
export function createSign(flag: THREE.Texture): THREE.Group {
  if (!signTemplate) {
    const m = materials();
    const batch = new Batch();
    batch.box(m.metal, 0.11, 1.76, 0.12, 0, 0.88, 0.06);
    batch.box(m.metal, 2.08, 1.13, 0.16, 0, 1.42, 0);
    batch.box(m.plaster, 0.35, 0.12, 0.4, 0, 0.06, 0);
    signTemplate = batch.finish('painted-roadside-sign');
  }
  const group = signTemplate.clone();
  const face = new THREE.Mesh(signPanelGeometry, flagMaterial(flag));
  face.position.set(0, 1.42, -0.097);
  face.scale.set(1.95, 1, 0.035);
  face.castShadow = face.receiveShadow = true;
  group.add(face);
  return group;
}
