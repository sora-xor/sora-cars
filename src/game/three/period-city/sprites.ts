/**
 * Code-drawn pixel-art sprites for the 1986 streets, the fallback for any
 * generated sheet not yet made (scripts/build-street-sprites.ts, street-sprites.ts),
 * in 32 x 64 cells (an art pixel is about 3.4 cm on a person): salarymen in
 * suits and trench coats (and one wearing his tie round his head after a
 * night out), office ladies, police officers, schoolgirls in sailor uniforms
 * and sukeban long skirts, schoolboys in gakuran, bosozoku in embroidered
 * tokkofuku with their customised bikes, yankee in jerseys, SORA's crew and
 * fans, shoppers, obaachan, yukata strollers, dock workers, tourists,
 * cyclists on mamachari and the stray cats. People have front, back and side
 * views (the other side is mirrored) with a four-frame walk, a cheer (fans
 * wave SORA's flag), a yankee squat and the police officer's traffic signals.
 * Shading follows the cutscenes: violet shadows, amber light, dark outlines.
 * SORA's flag and emblem are pasted in from the supplied artwork (`Prints`).
 */
export const DRAWN_CELL = { width: 32, height: 64 } as const;
export const DRAWN_COLUMNS = 32;

type RGB = number;
const hex = (value: string): RGB => parseInt(value.slice(1), 16);
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
function mix(a: RGB, b: RGB, t: number): RGB {
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return byte(ar + (br - ar) * t) << 16 | byte(ag + (bg - ag) * t) << 8 | byte(ab + (bb - ab) * t);
}
/** Shadows lean violet, light leans amber, as in the cutscene palette. */
const shade = (c: RGB, k = .64) => mix(mix(c, 0, 1 - k), 0x2e1d4a, .18);
const light = (c: RGB, k = .3) => mix(c, 0xffe4b8, k);
const rim = (c: RGB) => mix(mix(c, 0, .72), 0x150a1e, .5);

/** A small RGBA image (row-major, top row first). */
export interface Pixels { readonly width: number; readonly height: number; readonly data: ArrayLike<number> }
/** SORA's artwork reduced to sprite size: the flag (12 x 7 and 8 x 5) and the emblem roundel (8 x 8 and 4 x 4). */
export interface Prints { readonly flag: Pixels; readonly flagSmall: Pixels; readonly emblem: Pixels; readonly emblemSmall: Pixels }
function solid(width: number, height: number, colour: RGB, round = false): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = !round || (x + .5 - width / 2) ** 2 + (y + .5 - height / 2) ** 2 <= (width / 2) ** 2, i = (y * width + x) * 4;
    data[i] = colour >> 16 & 255; data[i + 1] = colour >> 8 & 255; data[i + 2] = colour & 255; data[i + 3] = inside ? 255 : 0;
  }
  return { width, height, data };
}
/** Until the artwork loads: the flag's red field and a blank white roundel (never a stand-in emblem). */
export const BLANK_PRINTS: Prints = { flag: solid(12, 7, 0xd40000), flagSmall: solid(8, 5, 0xd40000), emblem: solid(8, 8, 0xffffff, true),
  emblemSmall: solid(4, 4, 0xffffff, true) };

class Atlas {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
}

/** Drawing in one cell (or a double-width cell), y down from its top. */
class Pen {
  constructor(private readonly atlas: Atlas, private readonly ox: number, private readonly oy: number,
    readonly w: number = DRAWN_CELL.width, readonly h: number = DRAWN_CELL.height) {}
  private index(x: number, y: number): number { return ((this.oy + y) * this.atlas.width + this.ox + x) * 4; }
  dot(x: number, y: number, c: RGB): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.index(x, y), d = this.atlas.data;
    d[i] = c >> 16 & 255; d[i + 1] = c >> 8 & 255; d[i + 2] = c & 255; d[i + 3] = 255;
  }
  opaque(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.atlas.data[this.index(x, y) + 3]! > 0; }
  at(x: number, y: number): RGB { const i = this.index(x, y), d = this.atlas.data; return d[i]! << 16 | d[i + 1]! << 8 | d[i + 2]!; }
  rect(x: number, y: number, w: number, h: number, c: RGB): void { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, c); }
  /** Rows y0..y1 whose left and right edges run from l0..r0 to l1..r1 (inclusive). */
  trapezoid(y0: number, y1: number, l0: number, r0: number, l1: number, r1: number, c: RGB): void {
    for (let y = y0; y <= y1; y++) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0), l = Math.round(l0 + (l1 - l0) * t), r = Math.round(r0 + (r1 - r0) * t);
      for (let x = l; x <= r; x++) this.dot(x, y, c);
    }
  }
  /** A thick stroke from (x0, y0) to (x1, y1), `width` pixels square. */
  limb(x0: number, y0: number, x1: number, y1: number, width: number, c: RGB): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)), half = (width - 1) / 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
      this.rect(Math.round(x - half), Math.round(y - half), width, width, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * .6) this.dot(x, y, c);
  }
  ring(cx: number, cy: number, r: number, thickness: number, c: RGB): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r + .45 && d > r - thickness + .45) this.dot(x, y, c);
    }
  }
  /** Paste a print (opaque texels only); `mirror` for its back face. */
  paste(print: Pixels, x: number, y: number, mirror = false): void {
    for (let j = 0; j < print.height; j++) for (let i = 0; i < print.width; i++) {
      const k = (j * print.width + (mirror ? print.width - 1 - i : i)) * 4;
      if (print.data[k + 3]! > 127) this.dot(x + i, y + j, print.data[k]! << 16 | print.data[k + 1]! << 8 | print.data[k + 2]!);
    }
  }
  /** The cutscene outline: a dark rim on every empty pixel touching the drawing. */
  outline(): void {
    const marks: [number, number, RGB][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.opaque(x, y)) continue;
      const near = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([dx, dy]) => this.opaque(x + dx, y + dy));
      if (near) marks.push([x, y, rim(this.at(x + near[0], y + near[1]))]);
    }
    for (const [x, y, c] of marks) this.dot(x, y, c);
  }
}

type HairStyle = 'short' | 'side' | 'bob' | 'long' | 'braids' | 'ponytail' | 'perm' | 'regent' | 'punch' | 'bun';
type Hat = 'police' | 'school' | 'helmet' | 'cap' | 'flatcap' | 'band' | 'scarf' | 'tie';
type TopStyle = 'suit' | 'coat' | 'blouse' | 'police' | 'sailor' | 'gakuran' | 'tokko' | 'jersey' | 'tee' | 'jacket' | 'jumpsuit'
  | 'apron' | 'cardigan' | 'yukata' | 'coverall' | 'tourist';
type Lower = 'trousers' | 'skirt' | 'long-skirt' | 'baggy';
type Carry = 'briefcase' | 'schoolbag' | 'handbag' | 'shopping' | 'sushi' | 'flag';
interface Look {
  readonly name: string;
  readonly style: TopStyle; readonly top: RGB; readonly inner?: RGB; readonly tie?: RGB; readonly trim?: RGB;
  readonly lower: Lower; readonly bottom: RGB; readonly socks?: RGB; readonly shoes: RGB;
  readonly skin?: RGB; readonly hair: RGB; readonly hairStyle: HairStyle; readonly hat?: Hat; readonly hatColour?: RGB;
  readonly face?: 'glasses' | 'sunglasses' | 'mask' | 'flushed'; readonly girl?: boolean;
  readonly carry?: Carry; readonly carryColour?: RGB; readonly gloves?: boolean; readonly waist?: RGB;
  /** SORA's emblem centred on the back (and small on the chest). */ readonly emblem?: boolean;
}
const SKIN = hex('#e8b48a');
const L = (look: Omit<Look, 'top' | 'bottom' | 'shoes' | 'hair' | 'inner' | 'tie' | 'trim' | 'socks' | 'hatColour' | 'carryColour' | 'waist' | 'skin'>
  & { top: string; bottom: string; shoes: string; hair: string; inner?: string; tie?: string; trim?: string; socks?: string; hatColour?: string;
    carryColour?: string; waist?: string; skin?: string }): Look => ({
  ...look, top: hex(look.top), bottom: hex(look.bottom), shoes: hex(look.shoes), hair: hex(look.hair),
  inner: look.inner ? hex(look.inner) : undefined, tie: look.tie ? hex(look.tie) : undefined, trim: look.trim ? hex(look.trim) : undefined,
  socks: look.socks ? hex(look.socks) : undefined, hatColour: look.hatColour ? hex(look.hatColour) : undefined,
  carryColour: look.carryColour ? hex(look.carryColour) : undefined, waist: look.waist ? hex(look.waist) : undefined,
  skin: look.skin ? hex(look.skin) : undefined,
});

/** The cast. Names are referenced by the crowd (people.ts). */
export const LOOKS: readonly Look[] = [
  L({ name: 'salaryman', style: 'suit', top: '#2a3350', inner: '#f2f0e8', tie: '#b8302c', lower: 'trousers', bottom: '#262c44', shoes: '#1a1414',
    hair: '#1e1618', hairStyle: 'side', carry: 'briefcase', carryColour: '#3a2418' }),
  L({ name: 'salaryman-grey', style: 'suit', top: '#6a6c72', inner: '#f2f0e8', tie: '#2a3a6a', lower: 'trousers', bottom: '#5c5e64', shoes: '#1a1414',
    hair: '#1e1618', hairStyle: 'side', face: 'glasses', carry: 'briefcase', carryColour: '#1a1a1e' }),
  L({ name: 'salaryman-charcoal', style: 'suit', top: '#34343c', inner: '#f2f0e8', tie: '#7a2a3a', lower: 'trousers', bottom: '#2c2c34', shoes: '#1a1414',
    hair: '#1e1618', hairStyle: 'short' }),
  L({ name: 'salaryman-senior', style: 'suit', top: '#5a4632', inner: '#efe8dc', tie: '#3a5a3a', lower: 'trousers', bottom: '#4a3a2a', shoes: '#2a1a14',
    hair: '#a8a49c', hairStyle: 'side', face: 'glasses', carry: 'briefcase', carryColour: '#3a2418' }),
  L({ name: 'trench', style: 'coat', top: '#b8a274', inner: '#f2f0e8', tie: '#7a2a2a', lower: 'trousers', bottom: '#3a3a44', shoes: '#1a1414',
    hair: '#1e1618', hairStyle: 'side', carry: 'briefcase', carryColour: '#2a1c14' }),
  L({ name: 'trench-grey', style: 'coat', top: '#8a8676', inner: '#f2f0e8', tie: '#2a2a4a', lower: 'trousers', bottom: '#2c2c34', shoes: '#1a1414',
    hair: '#1e1618', hairStyle: 'short', face: 'glasses' }),
  L({ name: 'drunk', style: 'suit', top: '#3a3e56', inner: '#f2f0e8', tie: '#c8402c', lower: 'trousers', bottom: '#30344a', shoes: '#1a1414',
    hair: '#1e1618', hairStyle: 'side', hat: 'tie', face: 'flushed', carry: 'sushi', carryColour: '#f2efe6' }),
  L({ name: 'office-lady', style: 'blouse', top: '#2a3356', inner: '#f4f2ec', tie: '#c8312b', lower: 'skirt', bottom: '#2a3356', socks: '#d8a888',
    shoes: '#1a1418', hair: '#2a1c16', hairStyle: 'bob', girl: true, carry: 'handbag', carryColour: '#5a2a2a' }),
  L({ name: 'office-lady-maroon', style: 'blouse', top: '#6a2a3a', inner: '#f4f2ec', tie: '#2a3356', lower: 'skirt', bottom: '#6a2a3a', socks: '#d8a888',
    shoes: '#1a1418', hair: '#1e1618', hairStyle: 'long', girl: true, carry: 'handbag', carryColour: '#1a1418' }),
  L({ name: 'office-lady-pink', style: 'jacket', top: '#e8a0b4', inner: '#f8f0ec', lower: 'skirt', bottom: '#e8a0b4', socks: '#e0b090', shoes: '#f0ece4',
    hair: '#4a2a1a', hairStyle: 'perm', girl: true, carry: 'handbag', carryColour: '#f4f0e8' }),
  L({ name: 'police', style: 'police', top: '#1f2a48', inner: '#9ab8dc', tie: '#1a2238', trim: '#e0b040', lower: 'trousers', bottom: '#1f2a48',
    shoes: '#141414', hair: '#1e1618', hairStyle: 'short', hat: 'police', hatColour: '#1f2a48' }),
  L({ name: 'police-traffic', style: 'police', top: '#1f2a48', inner: '#9ab8dc', tie: '#1a2238', trim: '#e0b040', lower: 'trousers', bottom: '#1f2a48',
    shoes: '#141414', hair: '#1e1618', hairStyle: 'short', hat: 'police', hatColour: '#1f2a48', gloves: true }),
  L({ name: 'schoolgirl', style: 'sailor', top: '#f4f2ec', trim: '#25305a', tie: '#c8312b', lower: 'skirt', bottom: '#25305a', socks: '#f4f2ec',
    shoes: '#5a3a24', hair: '#1e1618', hairStyle: 'long', girl: true, carry: 'schoolbag', carryColour: '#1a1418' }),
  L({ name: 'schoolgirl-winter', style: 'sailor', top: '#232c50', trim: '#1c2444', tie: '#e8e4dc', inner: '#232c50', lower: 'skirt', bottom: '#232c50',
    socks: '#232c50', shoes: '#3a2418', hair: '#1e1618', hairStyle: 'braids', girl: true, carry: 'schoolbag', carryColour: '#1a1418' }),
  L({ name: 'sukeban', style: 'sailor', top: '#232c50', trim: '#1c2444', tie: '#c8312b', inner: '#232c50', lower: 'long-skirt', bottom: '#1c2444',
    shoes: '#1a1418', hair: '#6a3a20', hairStyle: 'perm', girl: true, carry: 'schoolbag', carryColour: '#3a2418' }),
  L({ name: 'schoolboy-cap', style: 'gakuran', top: '#1c1c26', trim: '#e0b040', lower: 'trousers', bottom: '#1c1c26', shoes: '#141414',
    hair: '#1e1618', hairStyle: 'short', hat: 'school', hatColour: '#1c1c26', carry: 'schoolbag', carryColour: '#1a1418' }),
  L({ name: 'schoolboy', style: 'gakuran', top: '#1c1c26', trim: '#e0b040', lower: 'trousers', bottom: '#1c1c26', shoes: '#141414',
    hair: '#1e1618', hairStyle: 'short' }),
  L({ name: 'bosozoku', style: 'tokko', top: '#ece8de', trim: '#c8a030', tie: '#7a2a8a', lower: 'baggy', bottom: '#2a2a32', shoes: '#1a1a1a',
    hair: '#1e1618', hairStyle: 'regent', hat: 'band', hatColour: '#f4f2ec', face: 'sunglasses' }),
  L({ name: 'bosozoku-black', style: 'tokko', top: '#1c1a20', trim: '#d8b040', tie: '#c8312b', lower: 'baggy', bottom: '#1c1a20', shoes: '#1a1a1a',
    hair: '#1e1618', hairStyle: 'regent', face: 'mask' }),
  L({ name: 'bosozoku-purple', style: 'tokko', top: '#5a2a7a', trim: '#e8e0c0', tie: '#e8e0c0', lower: 'baggy', bottom: '#2a2232', shoes: '#1a1a1a',
    hair: '#2a1c16', hairStyle: 'punch', hat: 'band', hatColour: '#f4f2ec', face: 'sunglasses' }),
  L({ name: 'yankee', style: 'jersey', top: '#4a2a6a', trim: '#f2f0e8', lower: 'baggy', bottom: '#4a2a6a', shoes: '#e8e4dc', hair: '#3a2418',
    hairStyle: 'punch', face: 'sunglasses' }),
  L({ name: 'city-girl', style: 'tee', top: '#f4f2ec', lower: 'trousers', bottom: '#b8302c', shoes: '#f0ece4', hair: '#1e1618', hairStyle: 'bob',
    girl: true, waist: '#c83a30' }),
  L({ name: 'denim', style: 'jacket', top: '#4a6a9a', inner: '#f2f0e8', lower: 'trousers', bottom: '#34445e', shoes: '#f0ece4', hair: '#3a2418',
    hairStyle: 'short' }),
  L({ name: 'brights', style: 'jacket', top: '#e7b53a', inner: '#3fa0a0', lower: 'trousers', bottom: '#2a2c40', shoes: '#f0ece4', hair: '#1e1618',
    hairStyle: 'perm', girl: true }),
  L({ name: 'crew', style: 'jumpsuit', top: '#3a8a86', lower: 'trousers', bottom: '#3a8a86', shoes: '#2a2a2a', hair: '#1e1618', hairStyle: 'short',
    emblem: true }),
  L({ name: 'fan', style: 'tee', top: '#f4f2ec', lower: 'trousers', bottom: '#4a6a9a', shoes: '#f0ece4', hair: '#1e1618', hairStyle: 'short',
    emblem: true, carry: 'flag' }),
  L({ name: 'fan-girl', style: 'jacket', top: '#c8312b', inner: '#f4f2ec', lower: 'trousers', bottom: '#e8e2d6', shoes: '#f0ece4', hair: '#2a1c16',
    hairStyle: 'ponytail', girl: true, emblem: true, carry: 'flag' }),
  L({ name: 'obaachan', style: 'apron', top: '#5a4a5a', inner: '#e8dcc4', trim: '#c8b8a8', lower: 'skirt', bottom: '#5a4a5a', socks: '#d8ccbc',
    shoes: '#3a2a24', hair: '#a8a49c', hairStyle: 'bun', hat: 'scarf', hatColour: '#f4f2ec', girl: true }),
  L({ name: 'housewife', style: 'cardigan', top: '#c8a878', inner: '#ece4dc', lower: 'skirt', bottom: '#6a5a7a', socks: '#d8a888', shoes: '#3a2a24',
    hair: '#2a1c16', hairStyle: 'perm', girl: true, carry: 'shopping', carryColour: '#ece8dc' }),
  L({ name: 'old-man', style: 'cardigan', top: '#7a6a52', inner: '#e8e2d6', lower: 'trousers', bottom: '#4a4a4c', shoes: '#2a2420', hair: '#a8a49c',
    hairStyle: 'short', hat: 'flatcap', hatColour: '#6a5a44', face: 'glasses' }),
  L({ name: 'yukata', style: 'yukata', top: '#2e3d6a', trim: '#dcdcf0', tie: '#c8a060', lower: 'trousers', bottom: '#2e3d6a', shoes: '#6a4a30',
    hair: '#1e1618', hairStyle: 'short' }),
  L({ name: 'yukata-white', style: 'yukata', top: '#e8e4f0', trim: '#3a5a9a', tie: '#c8312b', lower: 'trousers', bottom: '#e8e4f0', shoes: '#6a4a30',
    hair: '#1e1618', hairStyle: 'bun', girl: true }),
  L({ name: 'yukata-pink', style: 'yukata', top: '#e8a8b8', trim: '#ffffff', tie: '#e7b53a', lower: 'trousers', bottom: '#e8a8b8', shoes: '#6a4a30',
    hair: '#2a1c16', hairStyle: 'bob', girl: true }),
  L({ name: 'dock', style: 'coverall', top: '#2e3a5a', lower: 'trousers', bottom: '#2e3a5a', shoes: '#2a2420', hair: '#1e1618', hairStyle: 'short',
    hat: 'helmet', hatColour: '#e7b53a' }),
  L({ name: 'dock-olive', style: 'coverall', top: '#4a5a3a', lower: 'trousers', bottom: '#4a5a3a', shoes: '#2a2420', hair: '#1e1618', hairStyle: 'short',
    hat: 'helmet', hatColour: '#f0ece4' }),
  L({ name: 'tourist', style: 'tourist', top: '#c23a30', lower: 'trousers', bottom: '#4a5a7a', shoes: '#e8e4dc', hair: '#2a1c16', hairStyle: 'short',
    hat: 'cap', hatColour: '#f0ece4' }),
  L({ name: 'tourist-beige', style: 'tourist', top: '#d8c8a0', lower: 'trousers', bottom: '#5a4a3a', shoes: '#5a4a3a', hair: '#a8a49c', hairStyle: 'short',
    hat: 'cap', hatColour: '#2a4a7a', face: 'glasses' }),
];

interface CatLook { readonly name: string; readonly coat: RGB; readonly patch?: RGB; readonly patch2?: RGB; readonly stripes?: RGB; readonly chest?: RGB; readonly eyes: RGB }
export const CATS: readonly CatLook[] = [
  { name: 'calico', coat: hex('#f2ede2'), patch: hex('#d88a3a'), patch2: hex('#2a2224'), eyes: hex('#d8c040') },
  { name: 'orange-tabby', coat: hex('#e09a4a'), stripes: hex('#b8682a'), chest: hex('#f2dcc0'), eyes: hex('#9ac040') },
  { name: 'black', coat: hex('#2a2428'), chest: hex('#ece8e0'), eyes: hex('#e8c840') },
  { name: 'grey-tabby', coat: hex('#9a9894'), stripes: hex('#5a5854'), chest: hex('#dcd8d0'), eyes: hex('#a8c050') },
  { name: 'white', coat: hex('#f4f2ec'), eyes: hex('#6ab0e0') },
];
interface RiderLook { readonly name: string; readonly look: string; readonly bike: RGB }
export const RIDERS: readonly RiderLook[] = [
  { name: 'rider-housewife', look: 'housewife', bike: hex('#b4b8bc') }, { name: 'rider-schoolboy', look: 'schoolboy', bike: hex('#26262a') },
  { name: 'rider-salaryman', look: 'salaryman-charcoal', bike: hex('#26262a') }, { name: 'rider-schoolgirl', look: 'schoolgirl', bike: hex('#e2dac6') },
  { name: 'rider-brights', look: 'brights', bike: hex('#b8352f') },
];
interface BikeLook { readonly name: string; readonly body: RGB; readonly stripe: RGB }
export const BIKES: readonly BikeLook[] = [
  { name: 'bike-purple', body: hex('#6a2a8a'), stripe: hex('#f2f0e8') }, { name: 'bike-black', body: hex('#1c1a22'), stripe: hex('#c8312b') },
  { name: 'bike-white', body: hex('#ece8e0'), stripe: hex('#2a4aa0') },
];

/** Each code-drawn row's kind in order: people, cats, riders, parked bikes. */
export const DRAWN_KIND = { person: 0, cat: 1, rider: 2, bike: 3 } as const;
export const DRAWN_ROWS: readonly { readonly name: string; readonly kind: number }[] = [
  ...LOOKS.map(look => ({ name: look.name, kind: DRAWN_KIND.person })), ...CATS.map(cat => ({ name: cat.name, kind: DRAWN_KIND.cat })),
  ...RIDERS.map(rider => ({ name: rider.name, kind: DRAWN_KIND.rider })), ...BIKES.map(bike => ({ name: bike.name, kind: DRAWN_KIND.bike })),
];
export function drawnRow(name: string): number {
  const row = DRAWN_ROWS.findIndex(entry => entry.name === name);
  if (row < 0) throw new Error(`No sprite "${name}".`);
  return row;
}
/**
 * Person columns: 0 front, 1-4 front walk, 5 back, 6-9 back walk, 10 side, 11-14 side walk, 15-18 cheer, 19-20 cheer from
 * behind, 21-23 squat (front, side, back), 24-25 traffic signals, 26-27 from behind. Cats: 0-2 sitting (front, back, side),
 * 3-6 walking, 7-8 from the front, 9-10 from behind, 11-12 curled up (side, front). Riders: four double-width side frames,
 * then two front and two back. Bikes: a double-width side, front, back.
 */
export const PERSON_COLUMNS = 28;

type View = 'front' | 'back' | 'side';
const SHOE_LIFT = [[0, 0], [0, 1], [2, 0], [1, 0], [0, 2]] as const;

function skinOf(look: Look): RGB { return look.skin ?? SKIN; }
function sleeveOf(look: Look): RGB {
  return look.style === 'blouse' || look.style === 'tee' ? look.inner ?? look.top : look.top;
}

/** Legs and shoes, front or back, rows from the hips (39 + bob) to the soles (62 - lift). */
function legsFront(pen: Pen, look: Look, step: number, bob: number): void {
  const [liftL, liftR] = SHOE_LIFT[step]!, bare = look.lower === 'skirt' ? look.socks ? mix(skinOf(look), look.socks, .25) : skinOf(look) : look.bottom;
  const legs = look.lower === 'skirt' ? bare : look.bottom;
  for (const [x0, lift, outer] of [[11, liftL, -1], [16, liftR, 1]] as const) {
    const top = 39 + bob, sole = 62 - lift, ankle = sole - 3;
    const wide = look.lower === 'baggy' ? 1 : 0;
    pen.rect(x0 - (outer < 0 ? wide : 0), top, 5 + wide, ankle - top + 1, legs);
    pen.rect(outer < 0 ? x0 + 4 : x0, top + 2, 1, ankle - top - 1, shade(legs));
    if (look.lower === 'trousers' && legs !== bare) pen.rect(outer < 0 ? x0 + 1 : x0 + 3, top + 4, 1, ankle - top - 6, light(legs, .15));
    if (look.lower === 'skirt' && look.socks && look.style === 'sailor') pen.rect(x0, ankle - 5, 5, 6, look.socks);
    if (look.style === 'yukata') { pen.rect(x0 + 1, sole - 2, 3, 2, skinOf(look)); pen.rect(x0, sole, 5, 1, look.shoes); continue; }
    pen.rect(x0 - (outer < 0 ? 1 : 0), sole - 2, 6, 3, look.shoes);
    pen.rect(x0 - (outer < 0 ? 1 : 0), sole - 2, 6, 1, light(look.shoes, .25));
  }
}

/** The torso and its garment, front or back. */
function torsoFront(pen: Pen, look: Look, bob: number, back: boolean, prints: Prints): void {
  const y = (row: number) => row + bob, top = look.top, dk = shade(top), lt = light(top, .18);
  // Long garments reach below the hips: coats, tokkofuku, yukata, the apron's dress and skirts.
  if (look.style === 'coat') pen.trapezoid(y(39), y(50), 10, 21, 9, 22, top);
  if (look.style === 'tokko') pen.trapezoid(y(39), y(56), 10, 21, 8, 23, top);
  if (look.style === 'yukata') pen.trapezoid(y(39), y(59), 10, 21, 10, 21, top);
  if (look.lower === 'skirt' && look.style !== 'yukata') pen.trapezoid(y(37), y(look.style === 'apron' ? 52 : 48), 10, 21, 9, 22, look.bottom);
  if (look.lower === 'long-skirt') pen.trapezoid(y(37), y(59), 10, 21, 9, 22, look.bottom);
  if (look.lower === 'skirt' || look.lower === 'long-skirt') {
    const hem = look.lower === 'long-skirt' ? 59 : look.style === 'apron' ? 52 : 48;
    if (look.style === 'sailor' || look.lower === 'long-skirt') for (const x of [11, 13, 18, 20]) pen.rect(x, y(41), 1, hem - 41, shade(look.bottom, .75));
    pen.rect(9, y(hem), 14, 1, shade(look.bottom, .8));
  }
  // Shoulders, chest and waist.
  pen.trapezoid(y(24), y(24), 10, 21, 10, 21, top);
  pen.trapezoid(y(25), y(33), 9, 22, 9, 22, top);
  pen.trapezoid(y(34), y(39), 10, 21, 10, 21, top);
  pen.rect(21, y(25), 2, 15, dk); pen.rect(9, y(25), 1, 8, lt);
  const inner = look.inner ?? 0xf2f0e8, tie = look.tie ?? 0xb8302c, trim = look.trim ?? 0xe0b040;
  if (back) {
    if (look.style === 'suit') pen.rect(15, y(34), 2, 6, dk);
    if (look.style === 'sailor') {
      // The square sailor collar on the back, a white stripe round its edge.
      pen.rect(10, y(24), 12, 8, look.trim ?? top); pen.rect(11, y(30), 10, 1, 0xf4f2ec); pen.rect(11, y(24), 1, 7, 0xf4f2ec); pen.rect(20, y(24), 1, 7, 0xf4f2ec);
    }
    if (look.style === 'tokko') for (let r = 27; r < 52; r += 3) pen.rect(14 + (r % 2), y(r), 3, 2, trim);
    if (look.style === 'yukata' && look.girl) { pen.rect(11, y(33), 10, 6, look.tie ?? trim); pen.rect(14, y(32), 4, 8, shade(look.tie ?? trim)); }
    else if (look.style === 'yukata') pen.rect(10, y(35), 12, 3, look.tie ?? trim);
    if (look.style === 'apron') { pen.rect(10, y(36), 12, 1, inner); pen.rect(13, y(35), 6, 3, inner); }
    if (look.style === 'police') { pen.rect(10, y(37), 12, 2, 0x161616); }
    if (look.style === 'jersey') pen.rect(10, y(24), 12, 1, shade(top, .8));
    if (look.emblem) pen.paste(prints.emblem, 12, y(26));
    return;
  }
  switch (look.style) {
    case 'suit': case 'coat': {
      pen.trapezoid(y(24), y(28), 13, 18, 15, 16, inner);
      pen.rect(15, y(25), 2, 9, tie); pen.rect(15, y(25), 2, 1, shade(tie));
      for (const [x, r] of [[13, 25], [13, 26], [14, 27], [14, 28], [18, 25], [18, 26], [17, 27], [17, 28]] as const) pen.dot(x, y(r), dk);
      if (look.style === 'suit') { pen.rect(16, y(29), 1, 10, dk); pen.dot(16, y(32), rim(top)); pen.dot(16, y(35), rim(top)); pen.rect(11, y(35), 3, 1, dk); pen.rect(18, y(35), 3, 1, dk); }
      else {
        pen.rect(10, y(35), 12, 2, dk); pen.rect(15, y(35), 2, 2, 0x8a6a3a); pen.rect(15, y(37), 1, 13, dk);
        for (const [x, r] of [[13, 29], [13, 32], [18, 29], [18, 32]] as const) pen.dot(x, y(r), rim(top));
        pen.rect(10, y(24), 2, 2, dk); pen.rect(20, y(24), 2, 2, dk);
      }
      break;
    }
    case 'blouse': {
      pen.trapezoid(y(24), y(26), 10, 21, 10, 21, inner);
      pen.trapezoid(y(27), y(39), 10, 21, 10, 21, top);
      pen.trapezoid(y(27), y(30), 14, 17, 15, 16, inner);
      pen.rect(14, y(25), 4, 2, tie); pen.rect(15, y(25), 2, 2, shade(tie));
      pen.dot(15, y(32), rim(top)); pen.dot(15, y(35), rim(top)); pen.rect(21, y(27), 1, 12, dk);
      break;
    }
    case 'police': {
      pen.trapezoid(y(24), y(26), 13, 18, 14, 17, inner);
      pen.rect(15, y(25), 2, 6, tie);
      pen.dot(12, y(28), trim); pen.rect(18, y(28), 2, 1, 0xe8e8e8);
      pen.rect(10, y(37), 12, 2, 0x161616); pen.rect(15, y(37), 2, 2, trim); pen.rect(20, y(37), 2, 5, 0x5a3a24);
      pen.rect(10, y(24), 2, 1, dk); pen.rect(20, y(24), 2, 1, dk);
      break;
    }
    case 'sailor': {
      const collar = look.trim ?? top, stripe = 0xf4f2ec;
      if (look.inner) pen.trapezoid(y(25), y(30), 14, 17, 15, 16, look.inner === top ? stripe : look.inner);
      pen.rect(10, y(24), 12, 2, collar);
      for (const [r, a, b] of [[26, 10, 13], [27, 11, 14], [28, 12, 14], [29, 13, 14], [30, 14, 15]] as const) {
        pen.rect(a, y(r), b - a + 1, 1, collar); pen.rect(31 - b, y(r), b - a + 1, 1, collar);
      }
      for (const [x, r] of [[11, 25], [12, 26], [13, 27], [20, 25], [19, 26], [18, 27]] as const) pen.dot(x, y(r), stripe);
      pen.rect(14, y(30), 4, 2, tie); pen.rect(15, y(30), 2, 2, shade(tie)); pen.rect(14, y(32), 2, 3, tie); pen.rect(16, y(32), 2, 3, shade(tie, .8));
      break;
    }
    case 'gakuran': {
      pen.rect(13, y(22), 6, 3, top); pen.rect(14, y(22), 4, 1, 0xf2f0e8);
      for (const r of [27, 30, 33, 36]) pen.rect(15, y(r), 2, 1, trim);
      pen.rect(15, y(26), 1, 13, rim(top));
      break;
    }
    case 'tokko': {
      pen.rect(13, y(22), 6, 3, top);
      pen.rect(15, y(25), 1, 32, dk);
      for (let r = 27; r < 36; r += 3) { pen.rect(11, y(r), 2, 2, trim); pen.rect(19, y(r), 2, 2, trim); }
      for (let r = 42; r < 54; r += 3) { pen.rect(10, y(r), 2, 2, trim); pen.rect(20, y(r), 2, 2, trim); }
      pen.rect(10, y(36), 12, 2, look.tie ?? trim);
      break;
    }
    case 'jersey': {
      pen.rect(15, y(24), 2, 16, light(top, .4)); pen.rect(13, y(24), 6, 1, shade(top, .8));
      break;
    }
    case 'tee': {
      pen.rect(14, y(24), 4, 1, skinOf(look));
      if (look.emblem) pen.paste(prints.emblemSmall, 17, y(28));
      if (look.waist) { pen.rect(10, y(37), 12, 3, look.waist); pen.rect(14, y(38), 4, 4, shade(look.waist)); pen.rect(13, y(41), 2, 5, look.waist); pen.rect(17, y(41), 2, 5, shade(look.waist)); }
      break;
    }
    case 'jacket': case 'tourist': {
      pen.rect(14, y(24), 4, 16, look.inner ?? 0xf2f0e8); pen.rect(13, y(24), 1, 16, dk); pen.rect(18, y(24), 1, 16, dk);
      pen.rect(11, y(24), 2, 2, dk); pen.rect(19, y(24), 2, 2, dk);
      if (look.emblem) pen.paste(prints.emblemSmall, 19, y(28));
      if (look.style === 'tourist') {
        pen.limb(11, y(24), 18, y(30), 1, 0x2a2420); pen.rect(17, y(30), 5, 4, 0x1e1c1e); pen.rect(18, y(31), 2, 2, 0x8aa0b0);
      }
      break;
    }
    case 'jumpsuit': case 'coverall': {
      pen.rect(15, y(24), 2, 18, dk); pen.rect(12, y(24), 8, 1, dk); pen.rect(10, y(37), 12, 1, dk);
      pen.rect(11, y(29), 3, 2, dk);
      if (look.emblem) pen.paste(prints.emblemSmall, 17, y(28));
      break;
    }
    case 'apron': {
      for (let r = 26; r < 52; r += 3) for (let x = 10 + (r % 2); x < 22; x += 3) pen.dot(x, y(r), look.trim ?? lt);
      pen.rect(12, y(24), 1, 3, inner); pen.rect(19, y(24), 1, 3, inner);
      pen.trapezoid(y(27), y(51), 11, 20, 11, 20, inner); pen.rect(13, y(40), 6, 2, shade(inner, .8)); pen.rect(20, y(27), 1, 25, shade(inner, .8));
      break;
    }
    case 'cardigan': {
      pen.trapezoid(y(24), y(27), 14, 17, 15, 16, inner); pen.rect(15, y(28), 2, 12, dk);
      for (const r of [29, 32, 35, 38]) pen.dot(16, y(r), light(top, .5));
      break;
    }
    case 'yukata': {
      const pattern = look.trim ?? lt;
      for (let r = 25; r < 60; r += 3) for (let x = 10 + (r % 3); x < 22; x += 3) pen.dot(x, y(r), pattern);
      pen.limb(12, y(24), 16, y(31), 1, light(top, .5)); pen.limb(19, y(24), 16, y(30), 1, shade(top, .7));
      pen.rect(10, y(35), 12, 4, look.tie ?? 0xc8a060); pen.rect(10, y(37), 12, 1, light(look.tie ?? 0xc8a060, .4));
      break;
    }
  }
}

/** Arms and what the hands hold, front or back; `raise` lifts the right arm (cheer, traffic). */
function armsFront(pen: Pen, look: Look, step: number, bob: number, back: boolean, raise: 'none' | 'cheer' | 'banzai' | 'out' | 'up', frame: number, prints: Prints): void {
  const y = (row: number) => row + bob, sleeve = sleeveOf(look), skin = skinOf(look), dk = shade(sleeve);
  const short = look.style === 'tee', wide = look.style === 'yukata', hand = look.gloves ? 0xf4f4f0 : skin;
  const swing = step === 1 ? [1, -1] : step === 3 ? [-1, 1] : [0, 0];
  // Back view: the right arm is on the viewer's left.
  const sides = [[6, swing[0]!, false], [23, swing[1]!, true]] as const;
  for (const [x0, s, right] of sides) {
    const raised = raise !== 'none' && (right !== back || raise === 'banzai');
    if (raised) {
      const out = raise === 'out', up = raise === 'up';
      if (out) {
        // Arm straight out to the side, a white glove at its end.
        const dir = x0 < 16 ? -1 : 1, x = x0 < 16 ? 0 : 23;
        pen.rect(x, y(25), 9, 3, sleeve); pen.rect(x, y(27), 9, 1, dk);
        pen.rect(dir < 0 ? 0 : 29, y(24), 3, 4, hand);
        continue;
      }
      const tip = up ? [x0 < 16 ? 2 : 29, 14] : [x0 < 16 ? 6 + (frame % 2) : 25 - (frame % 2), 9 + (frame % 2)];
      pen.limb(x0 + 1, y(26), tip[0]!, y(tip[1]! + 3), 3, sleeve);
      pen.rect(tip[0]! - 1, y(tip[1]!) - 1, 3, 3, hand);
      if (raise === 'cheer' && look.carry === 'flag' || raise === 'cheer' && right !== back) {
        // SORA's flag on its stick above the hand, waving.
        const sx = tip[0]!, wave = [0, 1, 0, -1][frame % 4]!;
        pen.limb(sx, y(tip[1]!) - 2, sx + wave, 0, 1, 0x3a2a20);
        const fx = sx < 16 ? sx + 1 + wave : sx - 12 + wave;
        if (look.carry === 'flag') pen.paste(prints.flag, fx, Math.max(0, wave === 0 ? 0 : 1), back);
      }
      continue;
    }
    const top = y(24), handY = y(38) + s;
    if (wide) { pen.rect(x0 - 1, top + 2, 4, 11, sleeve); pen.rect(x0 - 1, top + 12, 4, 1, dk); pen.rect(x0, handY - 1, 3, 3, hand); continue; }
    pen.rect(x0, top, 3, handY - top, sleeve);
    pen.rect(x0 < 16 ? x0 + 2 : x0, top + 1, 1, handY - top - 2, dk);
    if (short) pen.rect(x0, top + 5, 3, handY - top - 5, skin);
    if (look.style === 'sailor' || look.style === 'tokko' || look.style === 'jersey')
      pen.rect(x0, handY - 3, 3, 1, look.style === 'jersey' ? look.trim ?? 0xffffff : look.trim ?? dk);
    if (look.style === 'jersey') pen.rect(x0 < 16 ? x0 : x0 + 2, top + 1, 1, handY - top - 2, look.trim ?? 0xffffff);
    pen.rect(x0, handY, 3, 3, hand);
    // What the hand carries, on the viewer's left in front, right from behind.
    if (x0 < 16 === !back && look.carry && raise === 'none') carryFront(pen, look, x0, handY, prints);
  }
  if (raise === 'none' && look.carry === 'flag') {
    // A fan walking with the flag held up beside the head.
    const x = back ? 7 : 24;
    pen.limb(x, y(36), x, y(17), 1, 0x3a2a20);
    pen.paste(prints.flagSmall, back ? x - 8 : x + 1, y(17), back);
  }
}
function carryFront(pen: Pen, look: Look, x0: number, handY: number, prints: Prints): void {
  void prints;
  const c = look.carryColour ?? 0x2a1c14;
  switch (look.carry) {
    case 'briefcase': case 'schoolbag': pen.rect(x0, handY + 3, 3, look.carry === 'schoolbag' ? 6 : 7, c); pen.rect(x0, handY + 3, 1, 6, light(c, .25)); break;
    case 'handbag': pen.rect(x0 - 1, handY - 6, 3, 4, c); break;
    case 'shopping':
      pen.rect(x0 - 1, handY + 2, 4, 7, c); pen.rect(x0, handY - 3, 1, 5, 0x5aa040); pen.rect(x0 + 1, handY - 2, 1, 4, 0xe8eccc);
      pen.dot(x0, handY + 5, 0xc8312b);
      break;
    case 'sushi': pen.rect(x0 - 1, handY + 3, 4, 3, c); pen.rect(x0 - 1, handY + 4, 4, 1, 0xc8312b); pen.rect(x0 + 1, handY + 1, 1, 2, 0xc8312b); break;
  }
}

/** Head, hair and hat, front or back (rows from 11 + bob). */
function headFront(pen: Pen, look: Look, bob: number, back: boolean): void {
  const y = (row: number) => row + bob, skin = skinOf(look), hair = look.hair, hd = shade(hair), hl = light(hair, .22);
  pen.rect(14, y(21), 4, 3, shade(skin, .85));
  // Face: an oval, ears, then hair and hat over it.
  pen.rect(12, y(13), 8, 7, skin); pen.rect(13, y(20), 6, 1, skin); pen.rect(14, y(21), 4, 1, shade(skin, .9));
  pen.rect(19, y(14), 1, 6, shade(skin, .82));
  const coveredEars = ['bob', 'long', 'braids', 'perm'].includes(look.hairStyle);
  if (!coveredEars) { pen.rect(11, y(16), 1, 2, shade(skin, .85)); pen.rect(20, y(16), 1, 2, shade(skin, .8)); }
  if (!back) {
    const eye = 0x22161c;
    pen.rect(13, y(16), 1, 2, eye); pen.rect(18, y(16), 1, 2, eye);
    if (!look.girl) { pen.rect(13, y(15), 2, 1, hd); pen.rect(17, y(15), 2, 1, hd); }
    else { pen.dot(13, y(19), mix(skin, 0xe86070, .35)); pen.dot(18, y(19), mix(skin, 0xe86070, .35)); pen.dot(14, y(16), 0x4a3040); }
    pen.rect(15, y(20), 2, 1, shade(skin, .7));
    if (look.face === 'glasses') { pen.rect(12, y(16), 3, 1, 0x3a3a40); pen.rect(17, y(16), 3, 1, 0x3a3a40); pen.dot(15, y(16), 0x3a3a40); pen.dot(16, y(16), 0x3a3a40); }
    if (look.face === 'sunglasses') { pen.rect(12, y(16), 8, 2, 0x141218); pen.dot(13, y(16), 0x5a6a8a); pen.dot(17, y(16), 0x5a6a8a); }
    if (look.face === 'mask') { pen.rect(12, y(18), 8, 3, 0xf2f0ea); pen.rect(19, y(18), 1, 3, 0xc8c4bc); }
    if (look.face === 'flushed') { pen.rect(13, y(18), 2, 1, 0xe0606a); pen.rect(17, y(18), 2, 1, 0xe0606a); pen.dot(15, y(18), 0xd87070); }
  }
  // Hair.
  const fill = (x: number, r: number, w: number, h: number, c = hair) => pen.rect(x, y(r), w, h, c);
  switch (look.hairStyle) {
    case 'short': case 'side': case 'punch':
      fill(13, 11, 6, 1); fill(12, 12, 8, 2); fill(11, 13, 10, 1); fill(11, 14, 2, 2); fill(19, 14, 2, 2);
      if (look.hairStyle === 'side') { fill(13, 14, 4, 1); pen.rect(14, y(11), 1, 2, hl); } else fill(12, 14, 8, 1);
      if (look.hairStyle === 'punch') for (let r = 11; r < 15; r++) for (let x = 12 + (r % 2); x < 20; x += 2) pen.dot(x, y(r), hd);
      if (back) fill(11, 14, 10, 5);
      break;
    case 'bob': case 'long': case 'braids': case 'ponytail':
      fill(12, 10, 8, 1); fill(11, 11, 10, 3); fill(12, 14, 8, 1, hd); fill(12, 14, 8, 1);
      if (look.hairStyle !== 'ponytail') { fill(10, 12, 2, look.hairStyle === 'bob' ? 9 : 10); fill(20, 12, 2, look.hairStyle === 'bob' ? 9 : 10); }
      else { fill(11, 13, 1, 4); fill(20, 13, 1, 4); }
      pen.rect(13, y(11), 3, 1, hl);
      if (back) fill(10, 12, 12, look.hairStyle === 'bob' ? 9 : 8);
      if (look.hairStyle === 'long' && back) fill(10, 20, 12, 10);
      if (look.hairStyle === 'braids') { for (let r = 21; r < 34; r++) { pen.dot(10, y(r), r % 2 ? hair : hd); pen.dot(21, y(r), r % 2 ? hair : hd); } pen.dot(10, y(34), 0xc8312b); pen.dot(21, y(34), 0xc8312b); }
      if (look.hairStyle === 'ponytail' && back) { fill(11, 12, 10, 7); fill(15, 19, 2, 9, hd); fill(14, 18, 4, 2, 0xc8312b); }
      break;
    case 'perm':
      fill(11, 9, 10, 2); fill(10, 11, 12, 3); fill(9, 13, 3, 9); fill(20, 13, 3, 9); fill(12, 14, 8, 1);
      for (let r = 9; r < 22; r++) for (let x = 9 + (r % 2); x < 23; x += 2) if (pen.opaque(x, y(r)) && (x < 12 || x > 19 || r < 15)) pen.dot(x, y(r), hd);
      if (back) fill(10, 13, 12, 9);
      break;
    case 'regent':
      // The pompadour: a tall glossy quiff over a bare forehead, the sides slicked back.
      fill(13, 5, 7, 1); fill(12, 6, 9, 1); fill(11, 7, 10, 5); fill(11, 12, 2, 4); fill(19, 12, 2, 4);
      pen.rect(13, y(7), 6, 1, light(hair, .45)); pen.rect(12, y(10), 8, 1, hd);
      if (back) fill(11, 12, 10, 7);
      break;
    case 'bun':
      fill(13, 7, 6, 4); fill(12, 11, 8, 3); fill(11, 12, 2, 5); fill(19, 12, 2, 5); pen.rect(14, y(8), 3, 1, hl);
      if (back) fill(11, 12, 10, 6);
      break;
  }
  // Hats and bands.
  const hc = look.hatColour ?? 0x1f2a48;
  switch (look.hat) {
    case 'police': case 'school':
      pen.rect(11, y(8), 10, 4, hc); pen.rect(10, y(9), 12, 3, hc); pen.rect(10, y(12), 12, 1, 0x141414);
      if (!back) { pen.rect(11, y(13), 10, 1, 0x101010); pen.rect(13, y(13), 5, 1, 0x3a3a44); pen.rect(15, y(9), 2, 2, look.trim ?? 0xe0b040); }
      break;
    case 'helmet':
      pen.rect(12, y(8), 8, 1, hc); pen.rect(11, y(9), 10, 4, hc); pen.rect(9, y(13), 14, 1, shade(hc, .8)); pen.rect(13, y(9), 4, 1, light(hc, .4));
      break;
    case 'cap':
      pen.rect(12, y(9), 8, 1, hc); pen.rect(11, y(10), 10, 3, hc); if (!back) pen.rect(10, y(13), 11, 1, shade(hc, .75)); pen.dot(15, y(9), shade(hc));
      break;
    case 'flatcap':
      pen.rect(11, y(10), 10, 3, hc); pen.rect(10, y(11), 12, 2, hc); if (!back) pen.rect(11, y(13), 10, 1, shade(hc, .7));
      break;
    case 'band':
      pen.rect(11, y(13), 10, 2, hc); if (!back) pen.rect(15, y(13), 2, 2, 0xc8312b); else { pen.rect(15, y(15), 2, 4, hc); pen.dot(14, y(18), hc); }
      break;
    case 'scarf':
      pen.rect(12, y(9), 8, 1, hc); pen.rect(11, y(10), 10, 5, hc); pen.rect(11, y(14), 1, 2, hc); pen.rect(20, y(14), 1, 2, hc);
      pen.rect(13, y(10), 6, 1, shade(hc, .85)); if (back) { pen.rect(14, y(15), 4, 3, hc); pen.rect(15, y(18), 2, 2, shade(hc, .85)); }
      break;
    case 'tie':
      pen.rect(11, y(13), 10, 1, look.tie ?? 0xc8402c); pen.rect(20, y(13), 2, 1, look.tie ?? 0xc8402c); pen.rect(21, y(14), 1, 4, look.tie ?? 0xc8402c);
      break;
  }
}

/** A person facing the viewer or away: legs, garment, arms, head. */
function personFrontBack(pen: Pen, look: Look, back: boolean, step: number, raise: 'none' | 'cheer' | 'banzai' | 'out' | 'up', frame: number, prints: Prints): void {
  const bob = step === 1 || step === 3 ? 1 : 0;
  legsFront(pen, look, step, bob);
  if (back) headFront(pen, look, bob, true);
  torsoFront(pen, look, bob, back, prints);
  armsFront(pen, look, step, bob, back, raise, frame, prints);
  if (!back) headFront(pen, look, bob, false);
  else if (['long', 'braids', 'perm'].includes(look.hairStyle)) headFront(pen, look, bob, true);
  pen.outline();
}

/** A person in profile, facing right. */
function personSide(pen: Pen, look: Look, step: number, prints: Prints): void {
  const bob = step === 1 || step === 3 ? 1 : 0, y = (row: number) => row + bob;
  const skin = skinOf(look), top = look.top, dk = shade(top), sleeve = sleeveOf(look);
  const bare = look.lower === 'skirt' ? look.socks ? mix(skin, look.socks, .25) : skin : look.bottom;
  // Feet: where each ankle stands for the walk frame (near, far), and how far it lifts.
  const strides: readonly (readonly [number, number, number, number])[] = [[15.5, 15.5, 0, 0], [20, 11, 0, 0], [15.5, 13, 0, 2], [11, 20, 0, 0], [13, 15.5, 2, 0]];
  const [near, far, liftNear, liftFar] = strides[step]!;
  const leg = (ankleX: number, lift: number, c: RGB, shoe: RGB) => {
    const ankleY = 59 - lift;
    pen.limb(15.5, y(41), ankleX, ankleY, 4, c);
    if (look.lower === 'skirt' && look.style === 'sailor' && look.socks) pen.limb(ankleX - (ankleX - 15.5) * .2, ankleY - 4, ankleX, ankleY, 4, look.socks);
    if (look.style === 'yukata') { pen.rect(Math.round(ankleX) - 1, ankleY + 1, 4, 2, skin); pen.rect(Math.round(ankleX) - 2, ankleY + 3, 6, 1, look.shoes); return; }
    pen.rect(Math.round(ankleX) - 2, ankleY + 1, 6, 3, shoe); pen.rect(Math.round(ankleX) - 2, ankleY + 1, 6, 1, light(shoe, .25));
  };
  leg(far, liftFar, shade(look.lower === 'skirt' ? bare : look.bottom, .7), shade(look.shoes, .7));
  // The far arm swings behind the body.
  const armSwing = step === 1 ? -3 : step === 3 ? 3 : 0;
  pen.limb(15, y(26), 15 - armSwing, y(37), 3, shade(sleeve, .6));
  leg(near, liftNear, look.lower === 'skirt' ? bare : look.bottom, look.shoes);
  // Garment: long coats and robes, skirts over the legs.
  if (look.style === 'coat') pen.trapezoid(y(39), y(50), 12, 19, 11, 20, top);
  if (look.style === 'tokko') pen.trapezoid(y(39), y(56), 12, 19, 10, 21, top);
  if (look.style === 'yukata') pen.trapezoid(y(39), y(59), 12, 19, 12, 19, top);
  if (look.lower === 'skirt' && look.style !== 'yukata') pen.trapezoid(y(37), y(look.style === 'apron' ? 52 : 48), 12, 19, 10, 21, look.bottom);
  if (look.lower === 'long-skirt') pen.trapezoid(y(37), y(59), 12, 19, 10, 21, look.bottom);
  pen.trapezoid(y(24), y(24), 13, 18, 13, 18, top);
  pen.trapezoid(y(25), y(39), 12, 19, 12, 19, top);
  pen.rect(12, y(25), 1, 15, dk);
  if (look.style === 'blouse') { pen.rect(12, y(24), 8, 3, look.inner ?? 0xf4f2ec); pen.rect(19, y(25), 1, 2, look.tie ?? 0xc8312b); }
  if (look.style === 'suit' || look.style === 'coat' || look.style === 'police') {
    pen.rect(18, y(24), 2, 2, look.inner ?? 0xf2f0e8); pen.rect(19, y(25), 1, 6, look.tie ?? 0xb8302c);
    if (look.style === 'police') { pen.rect(12, y(37), 8, 2, 0x161616); pen.rect(13, y(38), 2, 4, 0x5a3a24); }
    if (look.style === 'coat') pen.rect(12, y(35), 8, 2, dk);
  }
  if (look.style === 'sailor') {
    pen.rect(11, y(24), 4, 6, look.trim ?? top); pen.rect(11, y(29), 4, 1, 0xf4f2ec);
    pen.rect(18, y(29), 3, 3, look.tie ?? 0xc8312b);
  }
  if (look.style === 'gakuran' || look.style === 'tokko') { pen.rect(15, y(22), 4, 3, top); for (const r of [27, 30, 33, 36]) pen.dot(19, y(r), look.trim ?? 0xe0b040); }
  if (look.style === 'tokko') { for (let r = 42; r < 54; r += 3) pen.rect(13, y(r), 2, 2, look.trim ?? 0xe0b040); pen.rect(12, y(36), 8, 2, look.tie ?? 0x7a2a8a); }
  if (look.style === 'jersey') pen.rect(19, y(24), 1, 16, light(top, .4));
  if (look.style === 'tee' && look.waist) { pen.rect(12, y(37), 8, 3, look.waist); pen.rect(11, y(39), 3, 6, shade(look.waist)); }
  if (look.style === 'jacket' || look.style === 'tourist') pen.rect(19, y(25), 1, 14, look.inner ?? 0xf2f0e8);
  if (look.style === 'tourist') { pen.rect(18, y(30), 4, 4, 0x1e1c1e); pen.dot(21, y(31), 0x8aa0b0); }
  if (look.style === 'apron') pen.trapezoid(y(27), y(51), 18, 19, 18, 20, look.inner ?? 0xe8dcc4);
  if (look.style === 'yukata') { pen.rect(12, y(35), 8, 4, look.tie ?? 0xc8a060); if (look.girl) pen.rect(10, y(33), 3, 6, look.tie ?? 0xc8a060); }
  if (look.emblem && look.style === 'jumpsuit') pen.rect(18, y(28), 1, 2, 0xc8312b);
  // Head in profile: the face to the right, an eye, a nose.
  pen.rect(14, y(22), 3, 2, shade(skin, .85));
  pen.rect(12, y(13), 8, 8, skin); pen.rect(13, y(21), 6, 1, skin); pen.dot(20, y(17), skin);
  pen.rect(18, y(16), 1, 2, 0x22161c); pen.dot(19, y(20), shade(skin, .7)); pen.rect(14, y(16), 1, 2, shade(skin, .82));
  if (look.face === 'glasses') pen.rect(17, y(16), 3, 1, 0x3a3a40);
  if (look.face === 'sunglasses') pen.rect(17, y(16), 4, 2, 0x141218);
  if (look.face === 'mask') pen.rect(17, y(18), 4, 3, 0xf2f0ea);
  if (look.face === 'flushed') pen.rect(17, y(18), 2, 1, 0xe0606a);
  const hair = look.hair, hd = shade(hair), fill = (x: number, r: number, w: number, h: number, c = hair) => pen.rect(x, y(r), w, h, c);
  switch (look.hairStyle) {
    case 'short': case 'side': case 'punch': fill(12, 11, 7, 1); fill(11, 12, 9, 2); fill(11, 14, 3, 4); fill(17, 13, 3, 1); break;
    case 'bob': fill(12, 10, 7, 1); fill(11, 11, 9, 3); fill(10, 13, 5, 8); fill(17, 13, 3, 2); break;
    case 'long': case 'braids': fill(12, 10, 7, 1); fill(11, 11, 9, 3); fill(10, 13, 5, 16); fill(17, 13, 3, 2); break;
    case 'ponytail': fill(12, 10, 7, 1); fill(11, 11, 9, 3); fill(11, 13, 4, 5); fill(17, 13, 3, 1); fill(8, 13, 3, 10, hd); fill(10, 12, 2, 2, 0xc8312b); break;
    case 'perm': fill(11, 9, 9, 2); fill(10, 11, 11, 3); fill(9, 13, 6, 9); fill(17, 13, 4, 2);
      for (let r = 9; r < 22; r++) for (let x = 9 + (r % 2); x < 21; x += 2) if (pen.opaque(x, y(r)) && (x < 15 || r < 15)) pen.dot(x, y(r), hd); break;
    case 'regent': fill(12, 6, 9, 1); fill(11, 7, 12, 5); fill(11, 12, 4, 5); pen.rect(14, y(7), 8, 1, light(hair, .45)); fill(21, 8, 2, 3); break;
    case 'bun': fill(12, 11, 7, 2); fill(11, 12, 5, 6); fill(8, 11, 4, 4); pen.rect(9, y(11), 2, 1, light(hair, .22)); break;
  }
  const hc = look.hatColour ?? 0x1f2a48;
  switch (look.hat) {
    case 'police': case 'school': pen.rect(11, y(8), 9, 4, hc); pen.rect(10, y(12), 10, 1, 0x141414); pen.rect(17, y(13), 5, 1, 0x101010);
      pen.rect(18, y(9), 2, 2, look.trim ?? 0xe0b040); break;
    case 'helmet': pen.rect(11, y(8), 9, 5, hc); pen.rect(9, y(13), 14, 1, shade(hc, .8)); break;
    case 'cap': pen.rect(11, y(9), 9, 4, hc); pen.rect(18, y(12), 5, 1, shade(hc, .75)); break;
    case 'flatcap': pen.rect(10, y(10), 11, 3, hc); pen.rect(19, y(12), 3, 1, shade(hc, .7)); break;
    case 'band': pen.rect(11, y(13), 9, 2, hc); pen.rect(9, y(13), 2, 4, hc); break;
    case 'scarf': pen.rect(11, y(9), 9, 6, hc); pen.rect(9, y(13), 3, 4, hc); break;
    case 'tie': pen.rect(11, y(13), 9, 1, look.tie ?? 0xc8402c); pen.rect(10, y(13), 1, 5, look.tie ?? 0xc8402c); break;
  }
  // The near arm, swinging, and what it carries.
  const handX = 15 + armSwing, handY = y(39);
  pen.limb(15.5, y(26), handX, handY - 2, 3, sleeve);
  if (look.style === 'tee') pen.limb(15.5 + armSwing * .3, y(30), handX, handY - 2, 3, skin);
  pen.rect(Math.round(handX) - 1, handY - 1, 3, 3, look.gloves ? 0xf4f4f0 : skin);
  const c = look.carryColour ?? 0x2a1c14, hx = Math.round(handX);
  if (look.carry === 'briefcase' || look.carry === 'schoolbag') { pen.rect(hx - 3, handY + 2, 7, look.carry === 'schoolbag' ? 6 : 5, c); pen.rect(hx - 1, handY + 1, 3, 1, shade(c)); pen.rect(hx - 3, handY + 2, 7, 1, light(c, .25)); }
  if (look.carry === 'handbag') pen.rect(hx - 1, handY - 7, 3, 4, c);
  if (look.carry === 'shopping') { pen.rect(hx - 2, handY + 2, 5, 6, c); pen.rect(hx - 1, handY - 3, 1, 5, 0x5aa040); pen.rect(hx, handY - 2, 1, 4, 0xe8eccc); }
  if (look.carry === 'sushi') { pen.rect(hx - 2, handY + 3, 5, 3, c); pen.rect(hx - 2, handY + 4, 5, 1, 0xc8312b); }
  if (look.carry === 'flag') { pen.limb(hx, handY, hx + 2, y(17), 1, 0x3a2a20); pen.paste(prints.flagSmall, hx + 3, y(17)); }
  void prints;
  pen.outline();
}

/** The yankee squat (ヤンキー座り): knees wide, heels down, elbows on the knees. */
function personSquat(pen: Pen, look: Look, view: View): void {
  const skin = skinOf(look), top = look.top, legs = look.lower === 'skirt' ? skin : look.bottom, sleeve = sleeveOf(look);
  const drop = 14, y = (row: number) => row + drop;
  if (view === 'side') {
    pen.limb(13, 50, 21, 47, 5, legs); pen.limb(21, 47, 19, 59, 4, legs);
    pen.rect(16, 59, 7, 3, look.shoes);
    pen.trapezoid(y(24), y(36), 13, 20, 12, 19, top);
    if (look.style === 'tokko' || look.style === 'coat') pen.trapezoid(y(36), 54, 11, 19, 10, 20, top);
    pen.limb(17, y(27), 22, 47, 3, sleeve); pen.rect(21, 47, 3, 3, skin);
    pen.rect(14, y(13), 8, 8, skin); pen.rect(15, y(21), 6, 1, skin); pen.dot(22, y(17), skin); pen.rect(20, y(16), 1, 2, 0x22161c);
    if (look.face === 'sunglasses') pen.rect(19, y(16), 4, 2, 0x141218);
    if (look.face === 'mask') pen.rect(19, y(18), 4, 3, 0xf2f0ea);
    const hair = look.hair;
    if (look.hairStyle === 'regent') { pen.rect(14, y(6), 9, 1, hair); pen.rect(13, y(7), 12, 5, hair); pen.rect(13, y(12), 4, 5, hair); pen.rect(16, y(7), 8, 1, light(hair, .45)); }
    else { pen.rect(14, y(11), 7, 1, hair); pen.rect(13, y(12), 9, 2, hair); pen.rect(13, y(14), 3, 4, hair); }
    if (look.hat === 'band') pen.rect(13, y(13), 9, 2, look.hatColour ?? 0xf4f2ec);
    pen.outline();
    return;
  }
  const back = view === 'back';
  for (const s of [-1, 1]) {
    const hip = 15.5 + s * 3, knee = 15.5 + s * 9, foot = 15.5 + s * 8;
    pen.limb(hip, 49, knee, 50, 5, legs); pen.limb(knee, 50, foot, 59, 4, legs);
    pen.rect(Math.round(foot) - 3, 59, 6, 3, look.shoes);
  }
  if (look.style === 'tokko' || look.style === 'coat') pen.trapezoid(y(36), 54, 10, 21, 8, 23, top);
  pen.trapezoid(y(24), y(36), 10, 21, 10, 21, top); pen.rect(9, y(25), 14, 9, top); pen.rect(21, y(25), 2, 12, shade(top));
  if (!back && (look.style === 'jersey')) pen.rect(15, y(24), 2, 13, light(top, .4));
  if (!back && look.style === 'tokko') for (let r = 27; r < 36; r += 3) { pen.rect(11, y(r), 2, 2, look.trim ?? 0xe0b040); pen.rect(19, y(r), 2, 2, look.trim ?? 0xe0b040); }
  if (back && look.style === 'tokko') for (let r = 27; r < 40; r += 3) pen.rect(14, y(r), 3, 2, look.trim ?? 0xe0b040);
  for (const s of [-1, 1]) { pen.limb(15.5 + s * 7, y(26), 15.5 + s * 8, 47, 3, sleeve); pen.rect(Math.round(15.5 + s * 7.5) - 1, 47, 3, 3, skin); }
  headFront(pen, { ...look, carry: undefined }, drop, back);
  pen.outline();
}

/** A stray cat, drawn at twice the people's resolution in the lower half of the cell. */
function cat(pen: Pen, look: CatLook, pose: 'sit-front' | 'sit-back' | 'sit-side' | 'walk-side' | 'walk-front' | 'walk-back' | 'loaf-side' | 'loaf-front', frame: number): void {
  const coat = look.coat, dk = shade(coat, .78), chest = look.chest ?? coat;
  const patches = (x0: number, y0: number, x1: number, y1: number) => {
    // Calico patches and tabby stripes over whatever is already drawn.
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      if (!pen.opaque(xx, yy)) continue;
      if (look.patch && ((xx - x0) * 7 + (yy - y0) * 3) % 23 < 6 && (xx + yy) % 9 < 6) pen.dot(xx, yy, look.patch);
      if (look.patch2 && ((xx - x0) * 5 + (yy - y0) * 11) % 29 < 5) pen.dot(xx, yy, look.patch2);
      if (look.stripes && (yy + Math.floor(xx / 4)) % 4 === 0) pen.dot(xx, yy, look.stripes);
    }
  };
  const face = (cx: number, top: number, eyes: boolean) => {
    // A round head with two ears; eyes and a pink nose from the front.
    pen.rect(cx - 5, top + 2, 11, 8, coat); pen.rect(cx - 4, top + 1, 9, 1, coat); pen.rect(cx - 4, top + 10, 9, 1, coat);
    for (const s of [-1, 1]) { const ex = cx + s * 4; pen.rect(ex - 1, top - 2, 2, 3, coat); pen.dot(ex - (s < 0 ? 1 : 0), top - 3, coat); pen.dot(ex - (s < 0 ? 0 : 1), top - 1, 0xe8a0a0); }
    if (eyes) {
      for (const s of [-1, 1]) { pen.rect(cx + s * 2 - (s < 0 ? 1 : 0), top + 4, 2, 2, look.eyes); pen.dot(cx + s * 2 - (s < 0 ? 0 : 1) + (s < 0 ? 0 : 1), top + 5, 0x141010); }
      pen.rect(cx - 1, top + 7, 2, 1, 0xe08a90); pen.dot(cx - 1, top + 8, rim(coat)); pen.dot(cx, top + 8, rim(coat));
    }
  };
  if (pose === 'sit-front' || pose === 'sit-back' || pose === 'walk-front' || pose === 'walk-back') {
    const walk = pose.startsWith('walk'), back = pose.endsWith('back');
    pen.trapezoid(50, 62, 11, 20, 10, 21, coat);
    if (!back) pen.trapezoid(51, 59, 13, 18, 13, 18, chest);
    if (walk) { const s = frame % 2 ? 1 : -1; pen.rect(12 + s, 60, 3, 3, coat); pen.rect(17 - s, 59, 3, 3, coat); }
    else { pen.rect(12, 60, 3, 3, chest); pen.rect(17, 60, 3, 3, chest); }
    if (back) { pen.limb(16, 52, 19, 44, 2, coat); pen.limb(19, 44, 18, 40, 2, coat); }
    else pen.limb(21, 61, 26, 58, 2, coat);
    face(15.5, 40, !back);
    patches(9, 37, 27, 63);
    pen.outline();
    return;
  }
  if (pose === 'sit-side') {
    pen.trapezoid(48, 62, 12, 19, 9, 21, coat); pen.rect(18, 50, 4, 10, chest);
    pen.limb(9, 61, 3, 61, 2, coat); pen.limb(3, 61, 2, 57, 2, coat);
    pen.rect(19, 60, 4, 3, chest);
    pen.rect(14, 38, 11, 9, coat); pen.rect(15, 37, 9, 1, coat); pen.rect(15, 47, 8, 1, coat);
    pen.rect(16, 34, 2, 4, coat); pen.rect(21, 34, 2, 4, coat); pen.dot(17, 36, 0xe8a0a0);
    pen.rect(22, 41, 2, 2, look.eyes); pen.dot(23, 42, 0x141010); pen.dot(25, 44, 0xe08a90); pen.dot(25, 43, coat);
    patches(1, 33, 27, 63);
    pen.outline();
    return;
  }
  if (pose === 'walk-side') {
    pen.rect(7, 47, 17, 8, coat); pen.rect(8, 46, 15, 1, coat); pen.rect(8, 55, 15, 1, dk);
    const legs = [[0, 2, -2, 0], [2, 0, 0, -2], [0, -2, 2, 0], [-2, 0, 0, 2]][frame % 4]!;
    for (const [i, x] of [[0, 9], [1, 12], [2, 19], [3, 22]] as const) {
      const near = i % 2 === 1, dx = legs[i]!;
      pen.limb(x, 55, x + dx, 61, 2, near ? coat : dk); pen.rect(x + dx - 1, 61, 3, 2, near ? chest : dk);
    }
    pen.limb(7, 48, 3, 42, 2, coat); pen.limb(3, 42, 4, 37, 2, coat);
    pen.rect(21, 40, 9, 8, coat); pen.rect(22, 39, 7, 1, coat);
    pen.rect(22, 36, 2, 3, coat); pen.rect(26, 36, 2, 3, coat); pen.dot(23, 38, 0xe8a0a0);
    pen.rect(27, 42, 2, 2, look.eyes); pen.dot(28, 43, 0x141010); pen.dot(30, 45, 0xe08a90); pen.rect(23, 48, 5, 4, chest);
    patches(2, 35, 31, 63);
    pen.outline();
    return;
  }
  if (pose === 'loaf-side') {
    pen.rect(6, 53, 17, 9, coat); pen.rect(7, 52, 15, 1, coat); pen.rect(7, 62, 15, 1, dk);
    pen.limb(6, 61, 2, 61, 2, coat);
    pen.rect(18, 46, 10, 9, coat); pen.rect(19, 45, 8, 1, coat);
    pen.rect(19, 42, 2, 3, coat); pen.rect(24, 42, 2, 3, coat);
    pen.rect(24, 49, 2, 1, rim(coat)); pen.dot(27, 51, 0xe08a90);
    patches(1, 41, 29, 63);
    pen.outline();
    return;
  }
  pen.trapezoid(52, 62, 8, 23, 7, 24, coat); pen.rect(13, 58, 6, 4, chest);
  face(15.5, 44, true);
  patches(6, 41, 26, 63);
  pen.outline();
}

/** A rider on a mamachari in profile (double-width cell), the crank at quarter turn `frame`. */
function riderSide(pen: Pen, look: Look, bike: RGB, frame: number, prints: Prints): void {
  void prints;
  const skin = skinOf(look), top = look.top, legs = look.lower === 'skirt' ? skin : look.bottom, sleeve = sleeveOf(look);
  const tyre = 0x1c1a1c, metal = 0xb8bcc0, bd = shade(bike, .7);
  const bracket = [27, 52] as const, hip = [22, 35] as const, angle = frame * Math.PI / 2;
  const pedal = (a: number) => [bracket[0] + Math.cos(a) * 4, bracket[1] + Math.sin(a) * 4] as const;
  const knee = (foot: readonly [number, number]) => {
    // Two-bone reach from the hip to the pedal, the knee forward.
    const dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = Math.min(Math.hypot(dx, dy), 22.5), a = Math.atan2(dy, dx);
    const thigh = 11, shin = 12, bend = Math.acos(Math.max(-1, Math.min(1, (thigh * thigh + d * d - shin * shin) / (2 * thigh * d))));
    return [hip[0] + Math.cos(a - bend) * thigh, hip[1] + Math.sin(a - bend) * thigh] as const;
  };
  const drawLeg = (foot: readonly [number, number], c: RGB, shoe: RGB) => {
    const k = knee(foot);
    pen.limb(hip[0], hip[1], k[0], k[1], 4, c); pen.limb(k[0], k[1], foot[0], foot[1] - 1, 3, look.lower === 'skirt' ? skin : c);
    pen.rect(Math.round(foot[0]) - 1, Math.round(foot[1]) - 1, 4, 2, shoe);
  };
  drawLeg(pedal(angle + Math.PI), shade(legs, .7), shade(look.shoes, .7));
  pen.limb(25, 22, 39, 29, 3, shade(sleeve, .6));
  // The bicycle: wheels and mudguards, step-through frame, chain case, carrier, basket.
  for (const cx of [14, 49]) {
    pen.ring(cx, 52, 10, 2, tyre); pen.ring(cx, 52, 8, 1, 0x8a8e92); pen.rect(cx - 1, 51, 2, 2, metal);
    for (let a = 0; a < 4; a++) pen.limb(cx, 52, cx + Math.cos(a * .8 + .3) * 7, 52 + Math.sin(a * .8 + .3) * 7, 1, 0x9a9ea2);
    for (let a = 200; a <= 340; a += 10) pen.dot(cx + Math.cos(a * Math.PI / 180) * 11.5, 52 + Math.sin(a * Math.PI / 180) * 11.5, bike);
  }
  pen.limb(27, 52, 22, 37, 2, bike); pen.limb(27, 52, 34, 47, 2, bike); pen.limb(34, 47, 42, 37, 2, bike);
  pen.limb(42, 37, 43, 32, 2, bike); pen.limb(43, 37, 49, 52, 2, bd); pen.limb(22, 38, 14, 52, 1, bike); pen.limb(27, 52, 14, 52, 1, bd);
  pen.trapezoid(48, 54, 17, 29, 16, 28, bd);
  pen.limb(5, 36, 21, 36, 1, metal); pen.limb(8, 36, 14, 50, 1, metal);
  pen.limb(43, 32, 42, 27, 1, metal); pen.limb(42, 27, 37, 28, 2, 0x2a2a2c);
  pen.rect(44, 28, 10, 8, 0x8a8e92); for (let x = 45; x < 54; x += 2) pen.rect(x, 29, 1, 6, 0x5a5e62); pen.rect(44, 28, 10, 1, metal);
  pen.rect(44, 33, 2, 2, 0xf0e0a0);
  pen.rect(18, 34, 8, 2, 0x2a2224);
  // The rider, upright with a little lean into the bars.
  pen.limb(22, 34, 24, 23, 7, top);
  if (look.lower === 'skirt') pen.trapezoid(32, 38, 19, 26, 18, 30, look.bottom);
  if (look.style === 'sailor') { pen.rect(19, 21, 5, 5, look.trim ?? top); pen.rect(26, 27, 3, 3, look.tie ?? 0xc8312b); }
  if (look.style === 'suit') { pen.rect(26, 20, 2, 2, look.inner ?? 0xf2f0e8); pen.rect(27, 21, 1, 6, look.tie ?? 0xb8302c); }
  if (look.style === 'gakuran') for (const r of [23, 26, 29]) pen.dot(27, r, look.trim ?? 0xe0b040);
  if (look.style === 'cardigan') pen.rect(26, 21, 1, 11, shade(top));
  if (look.style === 'jacket') pen.rect(27, 21, 1, 10, look.inner ?? 0xf2f0e8);
  pen.rect(22, 18, 3, 2, shade(skin, .85));
  pen.rect(20, 9, 8, 8, skin); pen.rect(21, 17, 6, 1, skin); pen.dot(28, 13, skin); pen.rect(26, 12, 1, 2, 0x22161c);
  const hair = look.hair;
  if (look.hairStyle === 'long') { pen.rect(20, 6, 7, 1, hair); pen.rect(19, 7, 9, 3, hair); pen.rect(18, 9, 5, 14, hair); }
  else if (look.hairStyle === 'perm') { pen.rect(19, 5, 9, 2, hair); pen.rect(18, 7, 11, 3, hair); pen.rect(17, 9, 6, 9, hair); }
  else { pen.rect(20, 7, 7, 1, hair); pen.rect(19, 8, 9, 2, hair); pen.rect(19, 10, 3, 4, hair); }
  if (look.hat === 'school') { pen.rect(19, 4, 9, 4, look.hatColour ?? 0x1c1c26); pen.rect(25, 8, 5, 1, 0x101010); }
  drawLeg(pedal(angle), legs, look.shoes);
  pen.limb(25, 22, 38, 28, 3, sleeve); pen.rect(37, 27, 3, 3, skin);
  pen.outline();
}

/** A rider seen from the front or behind (single cell), knees rising in turn. */
function riderFrontBack(pen: Pen, look: Look, bike: RGB, back: boolean, frame: number, prints: Prints): void {
  const skin = skinOf(look), top = look.top, legs = look.lower === 'skirt' ? skin : look.bottom, sleeve = sleeveOf(look);
  pen.rect(15, 42, 2, 21, 0x1c1a1c); pen.rect(14, 40, 4, 3, bike); pen.rect(15, 36, 2, 5, bike);
  for (const s of [-1, 1]) {
    const up = (frame % 2 === 0) === (s < 0), kneeY = up ? 38 : 41, footY = up ? 47 : 51, x = 15.5 + s * 4;
    pen.limb(15.5 + s * 2, 34, x, kneeY, 4, legs); pen.limb(x, kneeY, x, footY, 3, look.lower === 'skirt' ? skin : legs);
    pen.rect(Math.round(x) - 2, footY, 4, 2, look.shoes);
  }
  if (look.lower === 'skirt') pen.trapezoid(32, 38, 11, 20, 10, 21, look.bottom);
  pen.trapezoid(21, 34, 10, 21, 10, 21, top); pen.rect(20, 22, 2, 12, shade(top));
  if (!back && look.style === 'sailor') { pen.rect(10, 21, 12, 2, look.trim ?? top); pen.rect(14, 26, 4, 2, look.tie ?? 0xc8312b); }
  if (!back && look.style === 'suit') { pen.trapezoid(21, 25, 13, 18, 15, 16, look.inner ?? 0xf2f0e8); pen.rect(15, 22, 2, 8, look.tie ?? 0xb8302c); }
  if (back && look.style === 'sailor') { pen.rect(10, 21, 12, 7, look.trim ?? top); pen.rect(11, 27, 10, 1, 0xf4f2ec); }
  for (const s of [-1, 1]) { pen.limb(15.5 + s * 6, 23, 15.5 + s * 9, 31, 3, sleeve); pen.rect(Math.round(15.5 + s * 9) - 1, 30, 3, 3, skin); }
  pen.rect(5, 31, 22, 1, 0x3a3a3e);
  if (!back) { pen.rect(10, 32, 12, 7, 0x8a8e92); for (let x = 11; x < 22; x += 2) pen.rect(x, 33, 1, 5, 0x5a5e62); pen.rect(15, 31, 2, 1, 0xf0e0a0); }
  else { pen.rect(11, 39, 10, 2, 0xb8bcc0); pen.rect(15, 41, 2, 1, 0xd02020); }
  headFront(pen, { ...look, carry: undefined }, -3, back);
  void prints;
  pen.outline();
}

/** A bosozoku bike: tall backrest, three-step seat, rocket cowl, raised bars and takeyari exhausts. */
function bike(pen: Pen, look: BikeLook, view: View): void {
  const body = look.body, stripe = look.stripe, chrome = 0xc8ccd0, tyre = 0x1a181a, seat = 0x1e1a20;
  if (view === 'side') {
    for (const cx of [14, 51]) { pen.ring(cx, 52, 10, 3, tyre); pen.ring(cx, 52, 7, 1, chrome); pen.rect(cx - 1, 51, 3, 3, chrome); }
    pen.limb(22, 50, 6, 47, 2, chrome); pen.limb(6, 47, 1, 20, 2, chrome); pen.limb(24, 52, 9, 50, 2, shade(chrome, .8)); pen.limb(9, 50, 4, 24, 2, shade(chrome, .8));
    pen.rect(24, 42, 15, 10, 0x9a9ea4); for (let r = 43; r < 52; r += 2) pen.rect(24, r, 15, 1, 0x5a5e64);
    pen.limb(14, 52, 26, 44, 2, 0x2a2a2e); pen.limb(39, 44, 51, 52, 2, chrome);
    pen.rect(25, 33, 16, 7, body); pen.rect(26, 32, 14, 1, body); pen.rect(26, 35, 14, 1, stripe); pen.rect(28, 33, 8, 1, light(body, .4));
    pen.rect(12, 34, 14, 4, seat); pen.rect(11, 30, 7, 4, seat); pen.rect(10, 26, 5, 4, seat);
    pen.rect(8, 10, 5, 18, body); pen.rect(8, 10, 5, 1, chrome); pen.rect(8, 10, 1, 18, chrome); pen.rect(9, 14, 3, 2, stripe);
    pen.rect(3, 39, 12, 3, body); pen.rect(2, 40, 3, 2, 0xd02020);
    pen.rect(40, 25, 14, 14, body); pen.rect(54, 28, 3, 9, body); pen.rect(41, 30, 15, 2, stripe); pen.rect(44, 19, 7, 6, 0xb8c8d8);
    pen.rect(56, 32, 2, 3, 0xffe890);
    pen.limb(41, 26, 39, 17, 1, chrome); pen.limb(39, 17, 35, 17, 2, 0x2a2a2e);
    pen.outline();
    return;
  }
  if (view === 'front') {
    pen.rect(14, 44, 4, 19, tyre); pen.rect(13, 42, 6, 3, chrome);
    pen.rect(7, 26, 18, 16, body); pen.rect(6, 29, 20, 10, body); pen.rect(7, 37, 18, 2, stripe);
    pen.disc(15.5, 33, 3, 0xffe890); pen.rect(10, 18, 12, 8, 0xb8c8d8);
    pen.rect(2, 21, 28, 2, 0x2a2a2e); pen.rect(1, 15, 2, 7, chrome); pen.rect(29, 15, 2, 7, chrome); pen.rect(0, 14, 4, 2, 0x3a3a3e); pen.rect(28, 14, 4, 2, 0x3a3a3e);
    pen.outline();
    return;
  }
  pen.rect(14, 44, 4, 19, tyre);
  pen.rect(3, 18, 3, 32, chrome); pen.rect(26, 18, 3, 32, chrome);
  pen.rect(11, 10, 10, 24, body); pen.rect(11, 10, 10, 1, chrome); pen.rect(13, 14, 6, 2, stripe);
  pen.rect(9, 34, 14, 6, seat); pen.rect(10, 40, 12, 3, 0xd02020); pen.rect(13, 44, 6, 3, 0xf0f0e8);
  pen.outline();
}

/** Draw the whole atlas; `prints` carries SORA's flag and emblem reduced from the supplied artwork. */
export function drawSprites(prints: Prints = BLANK_PRINTS): { width: number; height: number; data: Uint8ClampedArray } {
  const width = DRAWN_COLUMNS * DRAWN_CELL.width, height = DRAWN_ROWS.length * DRAWN_CELL.height, atlas = new Atlas(width, height);
  const cell = (row: number, column: number, wide = 1) => new Pen(atlas, column * DRAWN_CELL.width, row * DRAWN_CELL.height, DRAWN_CELL.width * wide);
  LOOKS.forEach((look, row) => {
    personFrontBack(cell(row, 0), look, false, 0, 'none', 0, prints);
    for (let step = 1; step <= 4; step++) personFrontBack(cell(row, step), look, false, step, 'none', 0, prints);
    personFrontBack(cell(row, 5), look, true, 0, 'none', 0, prints);
    for (let step = 1; step <= 4; step++) personFrontBack(cell(row, 5 + step), look, true, step, 'none', 0, prints);
    personSide(cell(row, 10), look, 0, prints);
    for (let step = 1; step <= 4; step++) personSide(cell(row, 10 + step), look, step, prints);
    const cheer = look.carry === 'flag' ? 'cheer' : 'banzai';
    for (let frame = 0; frame < 4; frame++) personFrontBack(cell(row, 15 + frame), look, false, 0, cheer, frame, prints);
    for (let frame = 0; frame < 2; frame++) personFrontBack(cell(row, 19 + frame), look, true, 0, cheer, frame * 2, prints);
    personSquat(cell(row, 21), look, 'front'); personSquat(cell(row, 22), look, 'side'); personSquat(cell(row, 23), look, 'back');
    personFrontBack(cell(row, 24), look, false, 0, 'out', 0, prints); personFrontBack(cell(row, 25), look, false, 0, 'up', 0, prints);
    personFrontBack(cell(row, 26), look, true, 0, 'out', 0, prints); personFrontBack(cell(row, 27), look, true, 0, 'up', 0, prints);
  });
  CATS.forEach((look, i) => {
    const row = LOOKS.length + i;
    cat(cell(row, 0), look, 'sit-front', 0); cat(cell(row, 1), look, 'sit-back', 0); cat(cell(row, 2), look, 'sit-side', 0);
    for (let frame = 0; frame < 4; frame++) cat(cell(row, 3 + frame), look, 'walk-side', frame);
    for (let frame = 0; frame < 2; frame++) { cat(cell(row, 7 + frame), look, 'walk-front', frame); cat(cell(row, 9 + frame), look, 'walk-back', frame); }
    cat(cell(row, 11), look, 'loaf-side', 0); cat(cell(row, 12), look, 'loaf-front', 0);
  });
  RIDERS.forEach((rider, i) => {
    const row = LOOKS.length + CATS.length + i, look = LOOKS.find(entry => entry.name === rider.look)!;
    for (let frame = 0; frame < 4; frame++) riderSide(cell(row, frame * 2, 2), look, rider.bike, frame, prints);
    for (let frame = 0; frame < 2; frame++) { riderFrontBack(cell(row, 8 + frame), look, rider.bike, false, frame, prints); riderFrontBack(cell(row, 10 + frame), look, rider.bike, true, frame, prints); }
  });
  BIKES.forEach((look, i) => {
    const row = LOOKS.length + CATS.length + RIDERS.length + i;
    bike(cell(row, 0, 2), look, 'side'); bike(cell(row, 2), look, 'front'); bike(cell(row, 3), look, 'back');
  });
  return { width, height, data: atlas.data };
}
