import * as THREE from 'three';
import { crownLight, crownLightGlsl } from '../autumn-foliage';
import { withCanopyGaps } from '../canopy-gaps';
import { seeded } from './layout';

/**
 * Plants modelled for the autumn routes (Irohazaka, Aizu, Kyoto, Nara), built once per variant as real geometry:
 * - Japanese maples (イロハモミジ, Acer palmatum): a short trunk forking into three or four limbs that spread wide and
 *   flatten out, their branches and twigs carrying layered pads of leaf cards, so the crown is the broad, tiered dome
 *   the cutscenes paint;
 * - sugi (杉, Cryptomeria japonica): a straight russet trunk and whorls of drooping needle sprays narrowing to the top;
 * - susuki (薄, Miscanthus): clumps of arching blades and tawny autumn plumes;
 * - low tufts of late-autumn grass, planted thickly over the wooded banks;
 * - weeping willows (枝垂れ柳) by the temple ponds: a leaning trunk whose limbs arch over and let fall long curtains of
 *   strands to the water;
 * - Japanese black pines (黒松) on the castle moats' walls: a crooked trunk leaning out, its branches ending in flat,
 *   layered cloud pads of needles.
 * Leaves, needles and blades are alpha-cut cards on one painted atlas. Card normals lean toward the crown's own surface
 * (a volume normal), so a crown shades as a mass, lit on its sun side, rather than as a scatter of planes. A chunk draws
 * all its plants in two batched draws, wood and foliage, each plant tinted (a maple crimson, orange or gold).
 */
export const FLORA_KIND = { maple: 0, cedar: 1, susuki: 2, willow: 3, pine: 4, grass: 5 } as const;
/** Floats per plant in CityMeshBuilder.flora: kind, x, y, z (chunk frame), yaw, scale, leaf tint r, g, b, seed. */
export const FLORA_STRIDE = 10;
const VARIANTS = [5, 3, 2, 2, 3, 2] as const;

type V3 = THREE.Vector3;
const TAU = Math.PI * 2;

/** One part's vertex streams (indexed). */
class Part {
  readonly positions: number[] = []; readonly normals: number[] = []; readonly uvs: number[] = []; readonly colors: number[] = [];
  readonly indices: number[] = [];
  get count(): number { return this.positions.length / 3; }
  vertex(p: V3, n: V3, u: number, v: number, c: THREE.Color): number {
    this.positions.push(p.x, p.y, p.z); this.normals.push(n.x, n.y, n.z); this.uvs.push(u, v); this.colors.push(c.r, c.g, c.b);
    return this.count - 1;
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/** A tapered, open cylinder from a to b (bark: vertex colour only). */
function tube(part: Part, a: V3, b: V3, r0: number, r1: number, sides: number, colour: THREE.Color, random: () => number): void {
  const dir = b.clone().sub(a).normalize(), helper = Math.abs(dir.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, helper).normalize(), v = new THREE.Vector3().crossVectors(dir, u);
  const base = part.count, shade = new THREE.Color(), n = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * TAU;
    n.copy(u).multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
    shade.copy(colour).multiplyScalar(.85 + random() * .3);
    part.vertex(p.copy(a).addScaledVector(n, r0), n, i / sides, 0, shade);
    part.vertex(p.copy(b).addScaledVector(n, r1), n, i / sides, 1, shade);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a0 = base + i * 2, b0 = a0 + 1, a1 = base + j * 2, b1 = a1 + 1;
    part.indices.push(a0, a1, b0, b0, a1, b1);
  }
}

/** UV rectangles (u0, v0, u1, v1) of the atlas cells; the canvas is 1024 x 1536, drawn top-down (flipY). */
const ATLAS = { width: 1024, height: 1536 } as const;
const cell = (x: number, y: number, size: number) => [x / ATLAS.width, 1 - (y + size) / ATLAS.height, (x + size) / ATLAS.width, 1 - y / ATLAS.height] as const;
const MAPLE_CELLS = [0, 1, 2, 3].map(i => cell(i * 256, 0, 256));
const CEDAR_CELLS = [0, 1].map(i => cell(i * 256, 256, 256));
const WILLOW_CELLS = [2, 3].map(i => cell(i * 256, 256, 256));
const SUSUKI_CELLS = [0, 1].map(i => cell(i * 512, 512, 512));
const PINE_CELLS = [0, 1, 2, 3].map(i => cell(i * 256, 1024, 256));
const GRASS_CELLS = [0, 1, 2, 3].map(i => cell(i * 256, 1280, 256));

/**
 * One foliage card: a quad of half-size `size` centred at `c`, facing `facing`, turned `turn` in its plane; its lighting
 * normal blends the card's facing with `volume` (the crown's outward direction at the card).
 */
function card(part: Part, c: V3, facing: V3, volume: V3, size: number, turn: number, uv: readonly number[], colour: THREE.Color, stretch = 1): void {
  const helper = Math.abs(facing.y) < .95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const across = new THREE.Vector3().crossVectors(helper, facing).normalize(), up = new THREE.Vector3().crossVectors(facing, across);
  const a = across.clone().multiplyScalar(Math.cos(turn)).addScaledVector(up, Math.sin(turn)).multiplyScalar(size);
  const b = up.clone().multiplyScalar(Math.cos(turn)).addScaledVector(across, -Math.sin(turn)).multiplyScalar(size * stretch);
  const n = facing.clone().multiplyScalar(.35).addScaledVector(volume, .65).normalize();
  const [u0, v0, u1, v1] = uv as [number, number, number, number], base = part.count, p = new THREE.Vector3();
  part.vertex(p.copy(c).sub(a).sub(b), n, u0, v0, colour);
  part.vertex(p.copy(c).add(a).sub(b), n, u1, v0, colour);
  part.vertex(p.copy(c).add(a).add(b), n, u1, v1, colour);
  part.vertex(p.copy(c).sub(a).add(b), n, u0, v1, colour);
  part.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const direction = (yaw: number, elevation: number) =>
  new THREE.Vector3(Math.cos(elevation) * Math.cos(yaw), Math.sin(elevation), Math.cos(elevation) * Math.sin(yaw));
const BARK = { maple: new THREE.Color('#3a302b'), cedar: new THREE.Color('#5b3626') };

/**
 * A Japanese maple about 9 m tall (instances scale it): a trunk forking low into spreading limbs, each limb's outer
 * half bending flatter and splitting into branches and twigs, with a layered pad of leaf cards at every branch end and
 * along the twigs. About 500 triangles.
 */
function buildMaple(seed: number): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const random = seeded(seed), height = 9, wood = new Part(), leaves = new Part();
  const forkY = height * (.17 + random() * .08), lean = new THREE.Vector3((random() - .5) * .5, 0, (random() - .5) * .5);
  const top = new THREE.Vector3(lean.x, forkY, lean.z);
  tube(wood, new THREE.Vector3(0, -.3, 0), new THREE.Vector3(lean.x * .3, .25, lean.z * .3), .36, .27, 7, BARK.maple, random);
  tube(wood, new THREE.Vector3(lean.x * .3, .25, lean.z * .3), top, .27, .2, 7, BARK.maple, random);
  const pads: { p: V3; size: number }[] = [];
  const limbs = 3 + Math.floor(random() * 2), spin = random() * TAU;
  for (let i = 0; i < limbs; i++) {
    const yaw = spin + i / limbs * TAU + (random() - .5) * .8, elevation = (.7 + random() * .35);
    const p1 = top.clone().addScaledVector(direction(yaw, elevation), height * (.24 + random() * .08));
    tube(wood, top, p1, .16, .11, 6, BARK.maple, random);
    // The outer limb bends flatter, so the crown spreads into a broad dome.
    const yaw2 = yaw + (random() - .5) * .6, elevation2 = elevation - .3 - random() * .25;
    const p2 = p1.clone().addScaledVector(direction(yaw2, elevation2), height * (.2 + random() * .08));
    tube(wood, p1, p2, .11, .065, 5, BARK.maple, random);
    pads.push({ p: p2.clone().add(new THREE.Vector3(0, .25, 0)), size: 1.15 });
    for (const [from, count, along] of [[p1, 2, yaw2], [p2, 3, yaw2]] as const) {
      for (let k = 0; k < count; k++) {
        const bYaw = along + (random() - .5) * 2.2, bElevation = .05 + random() * .55;
        const q = from.clone().addScaledVector(direction(bYaw, bElevation), height * (.1 + random() * .09));
        tube(wood, from, q, .06, .025, 4, BARK.maple, random);
        pads.push({ p: q.clone().add(new THREE.Vector3(0, .15, 0)), size: .95 + random() * .2 });
        pads.push({ p: from.clone().lerp(q, .55).add(new THREE.Vector3(0, .3, 0)), size: .75 });
      }
    }
  }
  // A few pads hang inside the crown so it reads full from below and through its gaps.
  const centre = pads.reduce((sum, pad) => sum.add(pad.p), new THREE.Vector3()).divideScalar(pads.length);
  for (let k = 0; k < 4; k++) pads.push({ p: centre.clone().add(new THREE.Vector3((random() - .5) * 2.5, -.4 + random() * .6, (random() - .5) * 2.5)), size: .8 });
  const crownTop = Math.max(...pads.map(pad => pad.p.y)), crownBottom = Math.min(...pads.map(pad => pad.p.y));
  const colour = new THREE.Color(), facing = new THREE.Vector3(), volume = new THREE.Vector3(), c = new THREE.Vector3();
  for (const pad of pads) {
    const cards = 4 + Math.floor(random() * 2);
    for (let k = 0; k < cards; k++) {
      const a = random() * TAU, r = Math.sqrt(random());
      c.set(pad.p.x + Math.cos(a) * r * 1.05 * pad.size, pad.p.y + (random() - .5) * .55 * pad.size, pad.p.z + Math.sin(a) * r * 1.05 * pad.size);
      volume.copy(c).sub(centre).setY((c.y - centre.y) * 1.6 + .6).normalize();
      // Leaves lie in layers: a card faces mostly up, tilted toward the crown's outside.
      facing.set(volume.x * .7 + (random() - .5) * .5, 1.1 + random() * .6, volume.z * .7 + (random() - .5) * .5).normalize();
      const height01 = (c.y - crownBottom) / Math.max(.1, crownTop - crownBottom), outer = Math.min(1, c.clone().sub(centre).setY(0).length() / 3.5);
      colour.setScalar(THREE.MathUtils.clamp(.62 + .3 * height01 + .12 * outer + (random() - .5) * .14, .45, 1.1));
      card(leaves, c, facing, volume, (.52 + random() * .24) * pad.size, random() * TAU, MAPLE_CELLS[Math.floor(random() * 4)]!, colour);
    }
  }
  return { wood: wood.geometry(), leaves: leaves.geometry() };
}

/**
 * A sugi about 24 m tall: a straight russet trunk and, from about two fifths of its height, whorls of five or six
 * branches every 0.7 m, each three drooping sprays of needle cards out along it, darker toward the trunk, the whorls
 * narrowing to a pointed top. Two sprays a branch of up to 2.8 m read up close as flat green leaves (Iroha bends, lap
 * .3). About 650 triangles.
 */
function buildCedar(seed: number): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const random = seeded(seed), height = 24, wood = new Part(), leaves = new Part();
  tube(wood, new THREE.Vector3(0, -.4, 0), new THREE.Vector3(0, height * .97, 0), .38, .05, 7, BARK.cedar, random);
  const crownBase = height * (.36 + random() * .1), colour = new THREE.Color(), facing = new THREE.Vector3(), volume = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let y = crownBase; y < height * .97; y += .62 + random() * .16) {
    const t = (y - crownBase) / (height - crownBase), radius = Math.pow(1 - t, .9) * (2.5 + random() * .5) + .25;
    const branches = 5 + Math.floor(random() * 2), spin = random() * TAU;
    for (let k = 0; k < branches; k++) {
      const yaw = spin + k / branches * TAU + (random() - .5) * .5;
      const out = direction(yaw, 0);
      for (let s = 0; s < 3; s++) {
        const along = radius * (.32 + s * .32);
        c.set(out.x * along, y - along * .3 - s * .12, out.z * along);
        volume.set(out.x, .25, out.z).normalize();
        // A spray hangs steeply, facing out and a little up.
        facing.set(out.x * .85, .3 + random() * .3, out.z * .85).normalize();
        colour.setScalar(THREE.MathUtils.clamp(.48 + .32 * t + .14 * s + (random() - .5) * .16, .38, 1.05));
        card(leaves, c, facing, volume, .3 + radius * .17, random() * TAU, CEDAR_CELLS[Math.floor(random() * 2)]!, colour);
      }
    }
  }
  for (let k = 0; k < 4; k++) {
    const yaw = k / 4 * TAU;
    c.set(Math.cos(yaw) * .2, height * .97 - .3, Math.sin(yaw) * .2);
    volume.set(Math.cos(yaw), .6, Math.sin(yaw)).normalize();
    card(leaves, c, volume, volume, .5, random() * TAU, CEDAR_CELLS[k % 2]!, colour.setScalar(.95));
  }
  return { wood: wood.geometry(), leaves: leaves.geometry() };
}

/** A susuki clump about 1.7 m tall: five crossed cards of blades and plumes, lit as the clump's own mound. */
function buildSusuki(seed: number): THREE.BufferGeometry {
  const random = seeded(seed), leaves = new Part(), colour = new THREE.Color(1, 1, 1), facing = new THREE.Vector3(), volume = new THREE.Vector3();
  const spin = random() * TAU;
  for (let k = 0; k < 5; k++) {
    const yaw = spin + k / 5 * Math.PI + (random() - .5) * .2;
    facing.set(Math.cos(yaw), 0, Math.sin(yaw));
    volume.set(Math.cos(yaw) * .4, 1, Math.sin(yaw) * .4).normalize();
    colour.setScalar(.85 + random() * .2);
    // A card stands on the ground: its centre half its height up.
    card(leaves, new THREE.Vector3((random() - .5) * .2, .85, (random() - .5) * .2), facing, volume, .72, 0, SUSUKI_CELLS[seed % 2]!, colour, 1.2);
  }
  return leaves.geometry();
}

/**
 * A low tuft of late-autumn grass about 0.6 m tall: three crossed cards of blades, lit as the tuft's own mound. Planted
 * thickly, they carpet the wooded banks as the repaints paint them, golden grass where the slope terrain alone was a
 * smooth orange plane (Umagaeshi, lap .12). 6 triangles.
 */
function buildGrass(seed: number): THREE.BufferGeometry {
  const random = seeded(seed), leaves = new Part(), colour = new THREE.Color(), facing = new THREE.Vector3(), volume = new THREE.Vector3();
  const spin = random() * TAU;
  for (let k = 0; k < 3; k++) {
    const yaw = spin + k / 3 * Math.PI + (random() - .5) * .3;
    facing.set(Math.cos(yaw), 0, Math.sin(yaw));
    volume.set(Math.cos(yaw) * .3, 1, Math.sin(yaw) * .3).normalize();
    colour.setScalar(.85 + random() * .2);
    card(leaves, new THREE.Vector3((random() - .5) * .1, .3, (random() - .5) * .1), facing, volume, .32, 0, GRASS_CELLS[(seed + k) % 4]!, colour);
  }
  return leaves.geometry();
}

/**
 * A weeping willow about 7 m tall: a trunk leaning out over the water, three or four limbs arching up and over, and
 * from each limb's outer half curtains of long hanging strand cards, lit as one rounded mass. About 300 triangles.
 */
function buildWillow(seed: number): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const random = seeded(seed), wood = new Part(), leaves = new Part(), lean = .25 + random() * .15;
  const top = new THREE.Vector3(lean * 3, 3, 0);
  tube(wood, new THREE.Vector3(0, -.3, 0), top, .3, .2, 7, BARK.maple, random);
  const colour = new THREE.Color(), facing = new THREE.Vector3(), volume = new THREE.Vector3(), c = new THREE.Vector3();
  const centre = new THREE.Vector3(lean * 3 + 1, 4.2, 0), limbs = 3 + Math.floor(random() * 2);
  for (let i = 0; i < limbs; i++) {
    const yaw = i / limbs * TAU + random() * .8, rise = top.clone().addScaledVector(direction(yaw, .9), 1.8 + random() * .6);
    const over = rise.clone().addScaledVector(direction(yaw, .1), 1.6 + random() * .8);
    tube(wood, top, rise, .15, .09, 5, BARK.maple, random);
    tube(wood, rise, over, .09, .04, 4, BARK.maple, random);
    for (let k = 0; k < 9; k++) {
      // A strand curtain hangs from a point along the limb's arc, its card upright and facing out from the crown.
      const t = .35 + k / 9 * .65, from = t < .5 ? top.clone().lerp(rise, t * 2) : rise.clone().lerp(over, (t - .5) * 2);
      const length = 1.4 + random() * 1.2;
      c.copy(from).add(new THREE.Vector3((random() - .5) * .6, -length * .55, (random() - .5) * .6));
      volume.copy(c).sub(centre).setY(.2).normalize();
      facing.set(volume.x, 0, volume.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (random() - .5) * 1.2);
      colour.setScalar(.7 + .3 * random());
      card(leaves, c, facing, volume, .45 + random() * .15, 0, WILLOW_CELLS[Math.floor(random() * 2)]!, colour, length / (.9 + random() * .2));
    }
  }
  return { wood: wood.geometry(), leaves: leaves.geometry() };
}

/**
 * A Japanese black pine about 9 m tall: a trunk in three crooked segments leaning out (over the moat, as castle pines
 * grow toward the water), five to seven branches from its upper half, each reaching out level and ending in a flat
 * cloud pad of needle tufts, and a pad at the top. About 450 triangles.
 */
function buildPine(seed: number): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const random = seeded(seed), wood = new Part(), leaves = new Part(), bark = new THREE.Color('#4a3a33');
  const lean = direction(random() * .6 - .3, 0), points = [new THREE.Vector3(0, -.3, 0)];
  for (let s = 1; s <= 3; s++) {
    const bend = new THREE.Vector3((random() - .5) * 1.2, 0, (random() - .5) * 1.2);
    points.push(points[s - 1]!.clone().add(new THREE.Vector3(0, 2.6 + random() * .6, 0)).addScaledVector(lean, 1.1 * s).add(bend));
  }
  for (let s = 0; s < 3; s++) tube(wood, points[s]!, points[s + 1]!, .32 - s * .08, .24 - s * .07, 7, bark, random);
  const pads: { p: V3; r: number }[] = [{ p: points[3]!.clone().add(new THREE.Vector3(0, .5, 0)), r: 1.5 }];
  const branches = 5 + Math.floor(random() * 3);
  for (let k = 0; k < branches; k++) {
    const t = .42 + k / branches * .55, s = Math.min(2, Math.floor(t * 3)), from = points[s]!.clone().lerp(points[s + 1]!, t * 3 - s);
    const yaw = k * 2.4 + random(), reach = 1.6 + random() * 1.6 * (1 - t * .5);
    const end = from.clone().addScaledVector(direction(yaw, .05 + random() * .2), reach);
    tube(wood, from, end, .1, .05, 5, bark, random);
    pads.push({ p: end.clone().add(new THREE.Vector3(0, .2, 0)), r: 1 + random() * .5 });
  }
  const colour = new THREE.Color(), facing = new THREE.Vector3(), volume = new THREE.Vector3(), c = new THREE.Vector3();
  for (const pad of pads) {
    // A cloud pad: needle tufts in a flat ellipse, the top layer lit, the underside a shade darker.
    const tufts = 9 + Math.floor(random() * 3);
    for (let n = 0; n < tufts; n++) {
      const a = random() * TAU, r = Math.sqrt(random()) * pad.r, up = (random() - .3) * .45;
      c.set(pad.p.x + Math.cos(a) * r, pad.p.y + up, pad.p.z + Math.sin(a) * r * .9);
      volume.set(Math.cos(a) * r / pad.r * .6, .8, Math.sin(a) * r / pad.r * .6).normalize();
      facing.set((random() - .5) * .6, 1, (random() - .5) * .6).normalize();
      colour.setScalar(THREE.MathUtils.clamp(.7 + up * .6 + (random() - .5) * .16, .45, 1.05));
      card(leaves, c, facing, volume, .5 + random() * .2, random() * TAU, PINE_CELLS[Math.floor(random() * 4)]!, colour);
    }
  }
  return { wood: wood.geometry(), leaves: leaves.geometry() };
}

// ---------------------------------------------------------------- the painted atlas

function mapleLeaf(g: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number, shade: number): void {
  g.save(); g.translate(x, y); g.rotate(turn);
  const lobes = 7, spread = Math.PI * 1.5, step = spread / (lobes - 1), notch = r * .24;
  g.beginPath();
  for (let i = 0; i < lobes; i++) {
    const a = -Math.PI / 2 - spread / 2 + i * step, length = r * [.5, .78, .96, 1, .96, .78, .5][i]!;
    const left = a - step / 2, right = a + step / 2;
    if (i === 0) g.moveTo(Math.cos(left) * notch, Math.sin(left) * notch);
    // A lobe: out from its notch to a sharp tip and back, its edges slightly toothed.
    g.quadraticCurveTo(Math.cos(a - .2) * length * .62, Math.sin(a - .2) * length * .62, Math.cos(a - .04) * length * .9, Math.sin(a - .04) * length * .9);
    g.lineTo(Math.cos(a) * length, Math.sin(a) * length);
    g.lineTo(Math.cos(a + .05) * length * .88, Math.sin(a + .05) * length * .88);
    g.quadraticCurveTo(Math.cos(a + .2) * length * .62, Math.sin(a + .2) * length * .62, Math.cos(right) * notch, Math.sin(right) * notch);
  }
  g.closePath();
  const v = Math.round(255 * shade);
  g.fillStyle = `rgb(${v},${v},${v})`; g.fill();
  g.strokeStyle = `rgba(0,0,0,.16)`; g.lineWidth = Math.max(1, r * .05);
  for (let i = 0; i < lobes; i++) {
    const a = -Math.PI / 2 - spread / 2 + i * step, length = r * [.5, .78, .96, 1, .96, .78, .5][i]!;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * length * .8, Math.sin(a) * length * .8); g.stroke();
  }
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, r * .5); g.stroke();
  g.restore();
}

function mapleCluster(g: CanvasRenderingContext2D, random: () => number, x0: number, y0: number, size: number): void {
  const cx = x0 + size / 2, cy = y0 + size / 2;
  for (let i = 0; i < 22; i++) {
    const a = random() * TAU, d = Math.sqrt(random()) * size * .33, r = size * (.09 + random() * .07);
    mapleLeaf(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * .9, r, random() * TAU, .78 + random() * .22);
  }
}

function cedarSpray(g: CanvasRenderingContext2D, random: () => number, x0: number, y0: number, size: number): void {
  const cx = x0 + size / 2;
  g.lineCap = 'round';
  for (let s = 0; s < 7; s++) {
    // A drooping branchlet from the top centre, beaded with short awl-shaped needles.
    const spreadX = (random() - .5) * size * .7, endX = cx + spreadX, endY = y0 + size * (.6 + random() * .32);
    const midX = cx + spreadX * .55, midY = y0 + size * (.12 + random() * .1);
    for (let t = 0; t <= 1; t += .035) {
      const px = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * midX + t * t * endX;
      const py = (1 - t) * (1 - t) * (y0 + size * .08) + 2 * (1 - t) * t * midY + t * t * endY;
      const v = Math.round(255 * (.72 + random() * .28));
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = size * (.022 + .01 * (1 - t));
      for (const side of [-1, 1]) {
        const length = size * (.05 + .05 * (1 - Math.abs(t - .4)));
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + side * length, py + length * .55); g.stroke();
      }
    }
  }
}

function willowStrands(g: CanvasRenderingContext2D, random: () => number, x0: number, y0: number, size: number): void {
  g.lineCap = 'round';
  for (let s = 0; s < 16; s++) {
    // A strand hangs from the top edge, swaying a little, beaded with narrow leaves pointing down along it.
    const startX = x0 + size * (.08 + random() * .84), sway = (random() - .5) * size * .18, bottom = y0 + size * (.75 + random() * .23);
    for (let t = 0; t <= 1; t += .045) {
      const px = startX + sway * t * t, py = y0 + 4 + (bottom - y0 - 4) * t, v = Math.round(255 * (.7 + random() * .3));
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = size * .018;
      for (const side of [-1, 1]) {
        const length = size * (.045 + random() * .03);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + side * length * .45, py + length); g.stroke();
      }
    }
  }
}

function pineTuft(g: CanvasRenderingContext2D, random: () => number, x0: number, y0: number, size: number): void {
  // Bundles of long needles in pairs, fanned from short shoots, packed into a ragged rounded mass.
  g.lineCap = 'round';
  for (let s = 0; s < 14; s++) {
    const cx = x0 + size * (.25 + random() * .5), cy = y0 + size * (.25 + random() * .5);
    for (let n = 0; n < 20; n++) {
      const a = random() * TAU, length = size * (.08 + random() * .1), v = Math.round(255 * (.68 + random() * .32));
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = size * (.01 + random() * .006);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * length, cy + Math.sin(a) * length * .8); g.stroke();
    }
  }
}

function susukiClump(g: CanvasRenderingContext2D, random: () => number, x0: number, y0: number, size: number): void {
  const baseX = x0 + size / 2, baseY = y0 + size - 6;
  g.lineCap = 'round';
  // Late-autumn blades: straw, tawny and russet, the repaints' golden banks (green blades read fresh under the crown light).
  const blade = ['#a08a4c', '#b39c56', '#c7a95d', '#8e7a3e', '#a4733f'];
  for (let i = 0; i < 52; i++) {
    const start = baseX + (random() - .5) * size * .12, lean = (random() - .5) * 2.4, length = size * (.42 + random() * .4);
    const endX = start + Math.sin(lean) * length, endY = baseY - Math.cos(lean) * length * .85;
    const ctrlX = start + Math.sin(lean) * length * .25, ctrlY = baseY - length * (.85 + random() * .2);
    g.strokeStyle = blade[Math.floor(random() * blade.length)]!; g.lineWidth = size * (.008 + random() * .006);
    g.beginPath(); g.moveTo(start, baseY); g.quadraticCurveTo(ctrlX, ctrlY, endX, endY); g.stroke();
  }
  // Late-autumn plumes: silky, but tawny and dusky rose rather than white, so they don't flare in low sun (the paler buff
  // plumes still read as white bushes at Akechidaira, lap .97).
  const plume = ['#a99070', '#9c8264', '#8f7462', '#a48a6c'];
  for (let i = 0; i < 9; i++) {
    const start = baseX + (random() - .5) * size * .1, lean = (random() - .5) * .9, length = size * (.78 + random() * .14);
    const topX = start + Math.sin(lean) * length * .5, topY = baseY - length;
    g.strokeStyle = '#8f7a4c'; g.lineWidth = size * .006;
    g.beginPath(); g.moveTo(start, baseY); g.quadraticCurveTo(start + Math.sin(lean) * length * .15, baseY - length * .6, topX, topY); g.stroke();
    // The plume: a fan of fine silky strands drooping to one side.
    for (let s = 0; s < 18; s++) {
      const a = -Math.PI / 2 + lean * .8 + (random() - .5) * 1.1, l = size * (.1 + random() * .12);
      g.strokeStyle = plume[Math.floor(random() * plume.length)]!; g.lineWidth = size * (.005 + random() * .005);
      g.beginPath(); g.moveTo(topX, topY + size * .1);
      g.quadraticCurveTo(topX + Math.cos(a) * l * .5, topY + Math.sin(a) * l * .3, topX + Math.cos(a) * l, topY + size * .1 + Math.sin(a) * l + l * .5);
      g.stroke();
    }
  }
}

/** A low grass tuft: arching blades from one root in amber, gold and tawny, a few russet; clipped to its cell. Straw and
 * olive blades read lime under the crown light; the repaints' banks are golden orange. */
function grassTuft(g: CanvasRenderingContext2D, random: () => number, x0: number, y0: number, size: number): void {
  const baseX = x0 + size / 2, baseY = y0 + size - 4, blade = ['#c58f45', '#d6a14f', '#b9803c', '#a0703a', '#b06a34', '#8a5a30', '#c49a52'];
  g.save(); g.beginPath(); g.rect(x0, y0, size, size); g.clip();
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const start = baseX + (random() - .5) * size * .3, lean = (random() - .5) * 2, length = size * (.3 + random() * .45);
    const endX = start + Math.sin(lean) * length, endY = baseY - Math.cos(lean) * length * .8;
    const ctrlX = start + Math.sin(lean) * length * .3, ctrlY = baseY - length * (.75 + random() * .2);
    g.strokeStyle = blade[Math.floor(random() * blade.length)]!; g.lineWidth = size * (.012 + random() * .01);
    g.beginPath(); g.moveTo(start, baseY); g.quadraticCurveTo(ctrlX, ctrlY, endX, endY); g.stroke();
  }
  g.restore();
}

let atlas: THREE.Texture | null = null;
function floraAtlas(): THREE.Texture {
  if (atlas) return atlas;
  if (typeof document === 'undefined') {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    return atlas = texture;
  }
  const canvas = document.createElement('canvas'); canvas.width = ATLAS.width; canvas.height = ATLAS.height;
  const g = canvas.getContext('2d')!, random = seeded(1986);
  for (let i = 0; i < 4; i++) mapleCluster(g, random, i * 256, 0, 256);
  for (let i = 0; i < 2; i++) cedarSpray(g, random, i * 256, 256, 256);
  for (let i = 2; i < 4; i++) willowStrands(g, random, i * 256, 256, 256);
  for (let i = 0; i < 2; i++) susukiClump(g, random, i * 512, 512, 512);
  for (let i = 0; i < 4; i++) pineTuft(g, random, i * 256, 1024, 256);
  for (let i = 0; i < 4; i++) grassTuft(g, random, i * 256, 1280, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return atlas = texture;
}

// ---------------------------------------------------------------- shared templates and materials

interface Template { readonly wood: THREE.BufferGeometry | null; readonly leaves: THREE.BufferGeometry }
let templates: Template[][] | null = null;
function floraTemplates(): Template[][] {
  if (templates) return templates;
  return templates = [
    Array.from({ length: VARIANTS[0] }, (_, i) => buildMaple(1101 + i * 37)),
    Array.from({ length: VARIANTS[1] }, (_, i) => buildCedar(2203 + i * 41)),
    Array.from({ length: VARIANTS[2] }, (_, i) => ({ wood: null, leaves: buildSusuki(i) })),
    Array.from({ length: VARIANTS[3] }, (_, i) => buildWillow(3301 + i * 43)),
    Array.from({ length: VARIANTS[4] }, (_, i) => buildPine(4409 + i * 47)),
    Array.from({ length: VARIANTS[5] }, (_, i) => ({ wood: null, leaves: buildGrass(i) })),
  ];
}

let materials: { wood: THREE.MeshStandardMaterial; foliage: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } | null = null;
function floraMaterials() {
  if (materials) return materials;
  const map = floraAtlas();
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
  wood.name = 'period-flora-bark';
  const foliage = new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest: .5, side: THREE.DoubleSide, roughness: .82, metalness: 0 });
  foliage.name = 'period-flora-leaves';
  // A crown is lit as one mass: the back of a card keeps its volume normal instead of facing into the tree. It is lit
  // as a painted crown, like the authored trees (crownLightGlsl): its own hue through light and shade, where plain
  // lighting paled sunlit maples to peach and sank their shade toward maroon under the dusk sky.
  foliage.onBeforeCompile = shader => {
    shader.uniforms.soraCrownLight = crownLight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 soraCrownLight;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <opaque_fragment>', `${crownLightGlsl('1.')}
#include <opaque_fragment>`);
  };
  foliage.customProgramCacheKey = () => 'period-flora-leaves-v4';
  const depth = withCanopyGaps(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5 }));
  return materials = { wood, foliage, depth };
}

/**
 * The plants of one chunk (CityMeshBuilder.flora) as two batched meshes, bark and foliage, in the chunk's frame.
 * Their geometry is copied from the shared templates, so a chunk's meshes dispose on their own.
 */
export function floraMeshes(data: readonly number[]): THREE.BatchedMesh[] {
  const count = data.length / FLORA_STRIDE;
  if (!count) return [];
  const all = floraTemplates(), used = new Map<Template, number>();
  const pick = (i: number) => { const kind = data[i * FLORA_STRIDE]!, list = all[kind]!; return list[Math.abs(Math.floor(data[i * FLORA_STRIDE + 9]!)) % list.length]!; };
  for (let i = 0; i < count; i++) { const t = pick(i); used.set(t, (used.get(t) ?? 0) + 1); }
  const size = (geometries: (THREE.BufferGeometry | null)[]) => geometries.reduce((sum, g) => g ? [sum[0]! + g.getAttribute('position').count, sum[1]! + g.index!.count] : sum, [0, 0]);
  const [woodVertices, woodIndices] = size([...used.keys()].map(t => t.wood)), [leafVertices, leafIndices] = size([...used.keys()].map(t => t.leaves));
  const { wood: woodMaterial, foliage, depth } = floraMaterials();
  const woodInstances = [...used].reduce((sum, [t, n]) => sum + (t.wood ? n : 0), 0);
  const bark = woodInstances ? new THREE.BatchedMesh(woodInstances, woodVertices, woodIndices, woodMaterial) : null;
  const leaves = new THREE.BatchedMesh(count, leafVertices, leafIndices, foliage);
  leaves.customDepthMaterial = depth;
  const ids = new Map<THREE.BufferGeometry, number>();
  const geometryId = (mesh: THREE.BatchedMesh, g: THREE.BufferGeometry) => {
    const key = ids.get(g); if (key !== undefined) return key;
    const id = mesh.addGeometry(g); ids.set(g, id); return id;
  };
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const o = i * FLORA_STRIDE, t = pick(i);
    position.set(data[o + 1]!, data[o + 2]!, data[o + 3]!);
    rotation.setFromAxisAngle(up, data[o + 4]!); scale.setScalar(data[o + 5]!);
    matrix.compose(position, rotation, scale);
    if (t.wood && bark) bark.setMatrixAt(bark.addInstance(geometryId(bark, t.wood)), matrix);
    const leaf = leaves.addInstance(geometryId(leaves, t.leaves));
    leaves.setMatrixAt(leaf, matrix);
    leaves.setColorAt(leaf, tint.setRGB(data[o + 6]!, data[o + 7]!, data[o + 8]!));
  }
  const meshes = [leaves, ...(bark ? [bark] : [])];
  for (const mesh of meshes) {
    mesh.name = mesh === leaves ? 'Period flora leaves' : 'Period flora bark';
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  }
  return meshes;
}
