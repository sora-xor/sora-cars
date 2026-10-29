import * as THREE from 'three';
import type { SignPools } from './signs';

/** Shared city materials; every chunk merges each into one mesh. */
export type CityMaterialKey = 'wall' | 'stone' | 'roof' | 'metal' | 'glass' | 'sign' | 'lamp' | 'water' | 'ground' | 'floodlit' | 'neon' | 'flag' | 'awning';
/** World-scale texture size per material; glass and print use their own UVs. */
const SURFACE_METRES: Partial<Record<CityMaterialKey, number>> = { wall: 3, stone: 2, roof: 2, metal: 1.5, water: 6, ground: 4, floodlit: 3 };
export type Vec3 = readonly [number, number, number];
/** Upward faces of these materials gather lying snow when a course snows. */
const SNOWY: ReadonlySet<CityMaterialKey> = new Set(['wall', 'stone', 'roof', 'metal', 'ground', 'floodlit']);
const SNOW = new THREE.Color('#e6eaf4');
/**
 * Lit-window classes (materials.ts): residential, office, shop, never lit, dim ground-floor lobbies, and the
 * blazing halls of pachinko parlours and stations (lit flat, with no room behind the glass).
 */
export const WINDOW_KIND = { home: 0, office: 1, shop: 2, dark: 3, lobby: 4, hall: 5 } as const;

class Stream {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly windows: number[] = [];
  readonly patterns: number[] = [];
}
/**
 * Wall finishes the wall shader draws as joints (materials.ts): plain, tile
 * (二丁掛け), brick, vertical seams or boards, cladding panels, mosaic tile,
 * horizontal siding.
 */
export const WALL_PATTERN = { plain: 0, tile: 1, brick: 2, seams: 3, panels: 4, mosaic: 5, siding: 6 } as const;

/**
 * Building-local primitives written straight into per-material vertex streams.
 * Local axes: +X along the frontage, +Y up, +Z into the lot; the facade is the
 * z = 0 plane and faces -Z. One frame (lot origin and yaw) is current at a time;
 * output positions are relative to the chunk origin to keep float precision.
 */
export class CityMeshBuilder {
  private readonly streams = new Map<CityMaterialKey, Stream>();
  private ox = 0; private oy = 0; private oz = 0; private c = 1; private s = 0;
  /** Current vertex colour (linear working space). */
  readonly colour = new THREE.Color();
  /** Current glass window: seed in [0, 1) and WINDOW_KIND. */
  window: [number, number] = [0, WINDOW_KIND.dark];
  /** Current wall finish (WALL_PATTERN), drawn on wall faces. */
  pattern: number = WALL_PATTERN.plain;
  /** Current print rectangle in the sign atlas (u0, v0, u1, v1). */
  print: [number, number, number, number] = [0, 0, 1, 1];
  /** Lying snow (0-1) on upward faces: roofs, slabs, awnings, sills and parked cars. */
  snow = 0;
  /** The street's own shop-sign pools; null keeps the whole original atlas. */
  signs: SignPools | null = null;
  /** Lamp animation written into a lamp face's UVs: phase (0-1) and mode (0 steady, 1 chasing bulbs, 2 a slow aviation blink). */
  animation: [number, number] = [0, 0];
  triangles = 0;
  /** Far lights (far-lights.ts): BEACON_STRIDE floats per light, in the chunk's frame. */
  readonly beacons: number[] = [];

  constructor(readonly originX: number, readonly originZ: number) {}

  /** Lot frame: the facade's front-centre at grade and the world yaw of local +Z. */
  frame(x: number, y: number, z: number, yaw: number): void {
    this.ox = x - this.originX; this.oy = y; this.oz = z - this.originZ; this.c = Math.cos(yaw); this.s = Math.sin(yaw);
  }
  tint(colour: THREE.Color | string | number): this { this.colour.set(colour); return this; }
  /** A local point in absolute world coordinates (light fixtures). */
  world(p: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(this.originX + this.ox + p.x * this.c + p.z * this.s, this.oy + p.y,
      this.originZ + this.oz - p.x * this.s + p.z * this.c);
  }

  /** A light the far street keeps as a glowing point (far-lights.ts): local point, linear HDR colour, its size in metres. */
  beacon(x: number, y: number, z: number, r: number, g: number, b: number, size: number): void {
    this.beacons.push(this.ox + x * this.c + z * this.s, this.oy + y, this.oz - x * this.s + z * this.c, r, g, b, size);
  }

  /** A planar polygon (3 or 4 points), wound to face `normal` (local). */
  face(key: CityMaterialKey, points: readonly Vec3[], normal: Vec3): void {
    const stream = this.streams.get(key) ?? new Stream(); this.streams.set(key, stream);
    const [a, b, c] = points as [Vec3, Vec3, Vec3];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const forward = (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2] >= 0;
    const order = points.length === 4 ? forward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2] : forward ? [0, 1, 2] : [0, 2, 1];
    const metres = SURFACE_METRES[key];
    const nx = normal[0] * this.c + normal[2] * this.s, nz = -normal[0] * this.s + normal[2] * this.c;
    const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]);
    const corner = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
    let r = this.colour.r, g = this.colour.g, bl = this.colour.b;
    if (this.snow > 0 && normal[1] > .35 && SNOWY.has(key)) {
      const k = this.snow * Math.min(1, (normal[1] - .35) / .45);
      r += (SNOW.r - r) * k; g += (SNOW.g - g) * k; bl += (SNOW.b - bl) * k;
    }
    for (const index of order) {
      const p = points[index]!;
      stream.positions.push(this.ox + p[0] * this.c + p[2] * this.s, this.oy + p[1], this.oz - p[0] * this.s + p[2] * this.c);
      stream.normals.push(nx, normal[1], nz);
      if (metres) {
        // Planar, metre-scale mapping in the building's own frame.
        const u = ay > Math.max(ax, az) ? p[0] : ax > az ? p[2] : p[0];
        const v = ay > Math.max(ax, az) ? p[2] : p[1];
        stream.uvs.push(u / metres, v / metres);
      } else if (key === 'lamp') {
        stream.uvs.push(this.animation[0], this.animation[1]);
      } else if (key === 'sign' || key === 'neon' || key === 'flag' || key === 'awning') {
        const [u0, v0, u1, v1] = this.print, k = corner[index]!;
        stream.uvs.push(u0 + (u1 - u0) * k[0], v0 + (v1 - v0) * k[1]);
      } else {
        const k = corner[index] ?? corner[0]; stream.uvs.push(k[0], k[1]);
      }
      stream.colors.push(r, g, bl);
      if (key === 'glass') stream.windows.push(this.window[0], this.window[1]);
      if (key === 'wall') stream.patterns.push(this.pattern);
    }
    this.triangles += order.length / 3;
  }

  /** A rectangle in the plane z = const facing -Z (toward the street) or +Z. */
  front(key: CityMaterialKey, x0: number, x1: number, y0: number, y1: number, z: number, facing: -1 | 1 = -1): void {
    // Corner order (x0,y0) (x1,y0) (x1,y1) (x0,y1) keeps print and pane UVs upright from the street.
    const left = facing < 0 ? x1 : x0, right = facing < 0 ? x0 : x1;
    this.face(key, [[left, y0, z], [right, y0, z], [right, y1, z], [left, y1, z]], [0, 0, facing]);
  }
  /** A rectangle in the plane x = const facing -X or +X; print reads left to right for a viewer facing it. */
  side(key: CityMaterialKey, x: number, z0: number, z1: number, y0: number, y1: number, facing: -1 | 1): void {
    const a = facing > 0 ? z1 : z0, b = facing > 0 ? z0 : z1;
    this.face(key, [[x, y0, a], [x, y0, b], [x, y1, b], [x, y1, a]], [facing, 0, 0]);
  }
  /** A horizontal rectangle at height y facing up or down. */
  flat(key: CityMaterialKey, x0: number, x1: number, z0: number, z1: number, y: number, facing: -1 | 1 = 1): void {
    this.face(key, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, facing, 0]);
  }

  /** Axis-aligned box. `skip` omits faces: 'b'ottom, 't'op, 'f'ront (-Z), 'k' back (+Z), 'l' (-X), 'r' (+X). */
  box(key: CityMaterialKey, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip = 'b'): void {
    if (!skip.includes('f')) this.front(key, x0, x1, y0, y1, z0, -1);
    if (!skip.includes('k')) this.front(key, x0, x1, y0, y1, z1, 1);
    if (!skip.includes('l')) this.side(key, x0, z0, z1, y0, y1, -1);
    if (!skip.includes('r')) this.side(key, x1, z0, z1, y0, y1, 1);
    if (!skip.includes('t')) this.flat(key, x0, x1, z0, z1, y1, 1);
    if (!skip.includes('b')) this.flat(key, x0, x1, z0, z1, y0, -1);
  }

  /** Vertical cylinder (tanks, columns, poles); `top` closes it. */
  cylinder(key: CityMaterialKey, x: number, y0: number, z: number, radius: number, height: number, segments = 10, top = true): void {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2, m = (a + b) / 2;
      const ax = x + Math.cos(a) * radius, az = z + Math.sin(a) * radius, bx = x + Math.cos(b) * radius, bz = z + Math.sin(b) * radius;
      this.face(key, [[ax, y0, az], [bx, y0, bz], [bx, y0 + height, bz], [ax, y0 + height, az]], [Math.cos(m), 0, Math.sin(m)]);
      if (top) this.face(key, [[x, y0 + height, z], [bx, y0 + height, bz], [ax, y0 + height, az]], [0, 1, 0]);
    }
  }

  /** A pitched roof over x0..x1 with its ridge along X, eaves at y, ridge `rise` higher. */
  gableRoof(key: CityMaterialKey, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, overhang = .45): void {
    const zm = (z0 + z1) / 2, run = (z1 - z0) / 2 + overhang, slope = Math.hypot(run, rise), ny = run / slope, nz = rise / slope;
    const xa = x0 - overhang * .6, xb = x1 + overhang * .6, drop = rise * overhang / run;
    this.face(key, [[xa, y - drop, z0 - overhang], [xb, y - drop, z0 - overhang], [xb, y + rise, zm], [xa, y + rise, zm]], [0, ny, -nz]);
    this.face(key, [[xa, y - drop, z1 + overhang], [xb, y - drop, z1 + overhang], [xb, y + rise, zm], [xa, y + rise, zm]], [0, ny, nz]);
  }

  /** Gable end walls (triangles) under a gableRoof, in the wall's material. */
  gableEnds(key: CityMaterialKey, x0: number, x1: number, z0: number, z1: number, y: number, rise: number): void {
    const zm = (z0 + z1) / 2;
    this.face(key, [[x0, y, z0], [x0, y, z1], [x0, y + rise, zm]], [-1, 0, 0]);
    this.face(key, [[x1, y, z0], [x1, y, z1], [x1, y + rise, zm]], [1, 0, 0]);
  }

  /** One BufferGeometry per material used. */
  finish(): Map<CityMaterialKey, THREE.BufferGeometry> {
    const result = new Map<CityMaterialKey, THREE.BufferGeometry>();
    for (const [key, stream] of this.streams) {
      if (!stream.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(stream.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(stream.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(stream.uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(stream.colors, 3));
      if (key === 'glass') geometry.setAttribute('cityWindow', new THREE.Float32BufferAttribute(stream.windows, 2));
      if (key === 'wall') geometry.setAttribute('cityPattern', new THREE.Float32BufferAttribute(stream.patterns, 1));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      result.set(key, geometry);
    }
    this.streams.clear();
    return result;
  }
}
