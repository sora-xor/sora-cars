import * as THREE from 'three';

/** Geometry helpers for the period cars: curves through keyframes, triangle buckets, lofts and sweeps. */
export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Monotone cubic interpolation through [t, value] keys (Fritsch-Carlson): smooth, and never past a key. */
export function curve(keys: readonly V2[]): (t: number) => number {
  if (keys.length === 1) return () => keys[0]![1];
  const n = keys.length, slopes: number[] = [], tangents: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((keys[i + 1]![1] - keys[i]![1]) / (keys[i + 1]![0] - keys[i]![0]));
  for (let i = 0; i < n; i++) {
    if (i === 0) tangents.push(slopes[0]!);
    else if (i === n - 1) tangents.push(slopes[n - 2]!);
    else tangents.push(slopes[i - 1]! * slopes[i]! <= 0 ? 0 : (slopes[i - 1]! + slopes[i]!) / 2);
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = tangents[i + 1] = 0; continue; }
    const a = tangents[i]! / slopes[i]!, b = tangents[i + 1]! / slopes[i]!, h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); tangents[i] = s * a * slopes[i]!; tangents[i + 1] = s * b * slopes[i]!; }
  }
  return t => {
    if (t <= keys[0]![0]) return keys[0]![1];
    if (t >= keys[n - 1]![0]) return keys[n - 1]![1];
    let i = 0; while (t > keys[i + 1]![0]) i++;
    const [t0, y0] = keys[i]!, [t1, y1] = keys[i + 1]!, h = t1 - t0, s = (t - t0) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * tangents[i]! + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * tangents[i + 1]!;
  };
}
/** Straight lines between keys. */
export function polyline(keys: readonly V2[]): (t: number) => number {
  return t => {
    if (t <= keys[0]![0]) return keys[0]![1];
    for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1]![0]) return lerp(keys[i]![1], keys[i + 1]![1], (t - keys[i]![0]) / (keys[i + 1]![0] - keys[i]![0]));
    return keys[keys.length - 1]![1];
  };
}

/** Triangles sorted into buckets by key (material and breakable part), each with its own normals. */
export class Buckets {
  private readonly data = new Map<string, { position: number[]; normal: number[]; uv: number[] }>();
  private bucket(key: string) {
    let found = this.data.get(key);
    if (!found) this.data.set(key, found = { position: [], normal: [], uv: [] });
    return found;
  }
  /** One triangle with per-vertex normals (outward) and uvs. */
  triangle(key: string, a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, ua: V2 = [0, 0], ub: V2 = [0, 0], uc: V2 = [0, 0]): void {
    const bucket = this.bucket(key);
    bucket.position.push(...a, ...b, ...c); bucket.normal.push(...na, ...nb, ...nc); bucket.uv.push(...ua, ...ub, ...uc);
  }
  /** A flat triangle: its own face normal. */
  flat(key: string, a: V3, b: V3, c: V3): void {
    const n = faceNormal(a, b, c);
    this.triangle(key, a, b, c, n, n, n);
  }
  /** Append a whole geometry (positions, normals and uvs; indexed or not). */
  geometry(key: string, geometry: THREE.BufferGeometry): void {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!source.getAttribute('normal')) source.computeVertexNormals();
    const bucket = this.bucket(key), position = source.getAttribute('position'), normal = source.getAttribute('normal'), uv = source.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      bucket.position.push(position.getX(i), position.getY(i), position.getZ(i));
      bucket.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      bucket.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (source !== geometry) source.dispose();
    geometry.dispose();
  }
  keys(): string[] { return [...this.data.keys()]; }
  /** Each bucket as an indexed geometry: equal vertices welded, so a car stays light to upload and draw. */
  build(): Map<string, THREE.BufferGeometry> {
    const result = new Map<string, THREE.BufferGeometry>();
    for (const [key, bucket] of this.data) {
      if (!bucket.position.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
      const welded = weld(geometry);
      welded.computeBoundingBox(); welded.computeBoundingSphere(); welded.name = key;
      result.set(key, welded);
    }
    return result;
  }
}

/** Merge identical vertices (position, normal and uv to 0.1 mm / 0.001) into an indexed geometry. */
export function weld(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  const keyOf = (i: number) => `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)},`
    + `${Math.round(normal.getX(i) * 1e3)},${Math.round(normal.getY(i) * 1e3)},${Math.round(normal.getZ(i) * 1e3)},${Math.round(uv.getX(i) * 1e3)},${Math.round(uv.getY(i) * 1e3)}`;
  const map = new Map<string, number>(), index: number[] = [], p: number[] = [], n: number[] = [], t: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = keyOf(i);
    let at = map.get(key);
    if (at === undefined) {
      at = p.length / 3; map.set(key, at);
      p.push(position.getX(i), position.getY(i), position.getZ(i)); n.push(normal.getX(i), normal.getY(i), normal.getZ(i)); t.push(uv.getX(i), uv.getY(i));
    }
    index.push(at);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(t, 2));
  result.setIndex(index);
  geometry.dispose();
  return result;
}

export function faceNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/**
 * A grid surface: rows of points (each row the same length), two triangles a cell, normals from the grid's own
 * tangents so a curved panel shades smoothly and its edges stay crisp against the next panel. `cell(i, k)` names the
 * bucket of the cell between rows i, i + 1 and columns k, k + 1, or null to leave it open. Normals point along
 * (column direction) x (row direction): order rows and columns so that is outward.
 */
export function grid(buckets: Buckets, rows: readonly (readonly V3[])[], cell: (i: number, k: number) => string | null, flip = false): void {
  const n = rows.length, m = rows[0]!.length, normals: V3[][] = [];
  for (let i = 0; i < n; i++) {
    const out: V3[] = [];
    for (let k = 0; k < m; k++) {
      const pk0 = rows[i]![Math.max(0, k - 1)]!, pk1 = rows[i]![Math.min(m - 1, k + 1)]!;
      let pi0 = rows[Math.max(0, i - 1)]![k]!, pi1 = rows[Math.min(n - 1, i + 1)]![k]!;
      // A degenerate row (a collapsed end) borrows its neighbour's direction.
      if (Math.hypot(pi1[0] - pi0[0], pi1[1] - pi0[1], pi1[2] - pi0[2]) < 1e-9) { pi0 = rows[Math.max(0, i - 1)]![k]!; pi1 = rows[Math.min(n - 1, i + 2)]?.[k] ?? pi1; }
      const dk = [pk1[0] - pk0[0], pk1[1] - pk0[1], pk1[2] - pk0[2]], di = [pi1[0] - pi0[0], pi1[1] - pi0[1], pi1[2] - pi0[2]];
      let x = dk[1]! * di[2]! - dk[2]! * di[1]!, y = dk[2]! * di[0]! - dk[0]! * di[2]!, z = dk[0]! * di[1]! - dk[1]! * di[0]!;
      if (flip) { x = -x; y = -y; z = -z; }
      const l = Math.hypot(x, y, z);
      out.push(l > 1e-12 ? [x / l, y / l, z / l] : [0, 1, 0]);
    }
    normals.push(out);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < m - 1; k++) {
    const key = cell(i, k);
    if (!key) continue;
    const a = rows[i]![k]!, b = rows[i]![k + 1]!, c = rows[i + 1]![k]!, d = rows[i + 1]![k + 1]!;
    const na = normals[i]![k]!, nb = normals[i]![k + 1]!, nc = normals[i + 1]![k]!, nd = normals[i + 1]![k + 1]!;
    const u0 = k / (m - 1), u1 = (k + 1) / (m - 1), v0 = i / (n - 1), v1 = (i + 1) / (n - 1);
    if (flip) {
      if (area(a, c, b) > 1e-12) buckets.triangle(key, a, c, b, na, nc, nb, [u0, v0], [u0, v1], [u1, v0]);
      if (area(b, c, d) > 1e-12) buckets.triangle(key, b, c, d, nb, nc, nd, [u1, v0], [u0, v1], [u1, v1]);
    } else {
      if (area(a, b, c) > 1e-12) buckets.triangle(key, a, b, c, na, nb, nc, [u0, v0], [u1, v0], [u0, v1]);
      if (area(b, d, c) > 1e-12) buckets.triangle(key, b, d, c, nb, nd, nc, [u1, v0], [u1, v1], [u0, v1]);
    }
  }
}
function area(a: V3, b: V3, c: V3): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** A flat polygon (star-shaped about its centroid), facing `facing`. */
export function cap(buckets: Buckets, key: string, points: readonly V3[], facing: V3): void {
  const c: V3 = [0, 1, 2].map(axis => points.reduce((sum, p) => sum + p[axis]!, 0) / points.length) as unknown as V3;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!, b = points[(k + 1) % points.length]!;
    if (area(c, a, b) < 1e-12) continue;
    const n = faceNormal(c, a, b), outward = n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] > 0;
    if (outward) buckets.triangle(key, c, a, b, facing, facing, facing); else buckets.triangle(key, c, b, a, facing, facing, facing);
  }
}

/**
 * Sweep a closed 2D profile along a path. Each path point carries its frame: the profile's u axis (`side`) and v axis
 * (`up`), so a bumper wraps round a corner with its face outward and a flare follows its arch. Frames are
 * right-handed (side x up is the path's direction) and the profile counter-clockwise in (u, v), so faces point out.
 * `closed` joins the path's ends; open ends get flat caps.
 */
export function sweep(buckets: Buckets, key: string, profile: readonly V2[], path: readonly { at: V3; side: V3; up: V3 }[], closed = false, caps = true): void {
  const rows = path.map(({ at, side, up }) => [...profile, profile[0]!].map(([u, v]): V3 => [at[0] + side[0] * u + up[0] * v, at[1] + side[1] * u + up[1] * v, at[2] + side[2] * u + up[2] * v]));
  if (closed) rows.push(rows[0]!);
  // Rows along the path, columns round the profile: (profile tangent) x (path direction) is the profile's outward normal.
  grid(buckets, rows, () => key);
  if (closed || !caps) return;
  const tangent = (i: number, j: number): V3 => {
    const a = path[i]!.at, b = path[j]!.at, l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
  };
  if (path.length < 2) return;
  const first = tangent(1, 0), last = tangent(path.length - 2, path.length - 1);
  cap(buckets, key, rows[0]!.slice(0, -1), first);
  cap(buckets, key, rows[rows.length - 1]!.slice(0, -1), last);
}

/** A rounded rectangle profile (width along u, height along v), centred, counter-clockwise. */
export function roundedRect(width: number, height: number, radius: number, segments = 3): V2[] {
  const r = clamp(radius, 0, Math.min(width, height) / 2), w = width / 2 - r, h = height / 2 - r, out: V2[] = [];
  const corners: [number, number, number][] = [[w, -h, -Math.PI / 2], [w, h, 0], [-w, h, Math.PI / 2], [-w, -h, Math.PI]];
  for (const [cx, cy, start] of corners) for (let s = 0; s <= segments; s++) {
    const a = start + s / segments * Math.PI / 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
/** A circle profile, counter-clockwise. */
export function circle(radius: number, segments = 8): V2[] {
  return Array.from({ length: segments }, (_, i) => { const a = i / segments * Math.PI * 2; return [Math.cos(a) * radius, Math.sin(a) * radius] as V2; });
}

/** A box between corners, every face flat. */
export function box(buckets: Buckets, key: string, min: V3, max: V3): void {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const quad = (a: V3, b: V3, c: V3, d: V3) => { buckets.flat(key, a, b, c); buckets.flat(key, a, c, d); };
  quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]);
  quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
  quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
}
