import { readFile, writeFile } from 'node:fs/promises';
import { compileStreetTrack, type AuthoredStreetTrack } from './lib/street-track-compiler';

/** Open bends tighter than a car can steer (world/README.md, "Drivable bends"). Each edit replaces the control
 * points between two anchors on a bend's own legs with the shortest path of the given radius (a Dubins path of
 * arcs and straights), resampled as points about 5.5 m apart; a `fillet` edit turns one corner into a single
 * circular arc. Gates move to the nearest new point. The original trace is world/research/routes/<id>.trace.json
 * and its edits <id>.bends.json; this writes the opened points into world/authoring/<id>.json and keeps that
 * file's other fields. Usage: tsx scripts/street-open-bends.ts <route id> [--check] */
type Point = AuthoredStreetTrack['points'][number];
type Anchor = { point: string; along?: number; back?: number; heading?: 'in' | 'out' };
type Edit = { name: string; radiusMm: number; fillet?: string; from?: Anchor; to?: Anchor };
type Spec = { route: string; maxGrade?: number; trims?: { point: string; cornerTrimMm: number }[]; edits: Edit[] };
type Pose = { x: number; y: number; a: number }; // a: anticlockwise from east, radians
type Segment = { kind: 'L' | 'R' | 'S'; length: number };

const [id, flag] = process.argv.slice(2);
if (!id || flag !== undefined && flag !== '--check') throw new Error('Use <route id> [--check]');
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const spec = await read(`world/research/routes/${id}.bends.json`) as Spec;
const trace = await read(`world/research/routes/${id}.trace.json`) as AuthoredStreetTrack;
const authoringPath = `world/authoring/${id}.json`, authoring = await read(authoringPath) as AuthoredStreetTrack;
if (spec.route !== id || trace.id !== id || authoring.id !== id) throw new Error(`${id}: trace, edits and authoring must name the same route.`);

// The compiler's own local projection, so distances match the compiled road.
const origin = trace.points[0]!.positionE7, radians = Math.PI / 180, earthRadiusMm = 6371008800;
const longitudeScale = Math.cos(origin[1] / 1e7 * radians);
const local = (p: Point) => ({ x: (p.positionE7[0] - origin[0]) / 1e7 * radians * earthRadiusMm * longitudeScale, y: (p.positionE7[1] - origin[1]) / 1e7 * radians * earthRadiusMm });
const e7 = (x: number, y: number): [number, number] => [Math.round(origin[0] + x / (radians * earthRadiusMm * longitudeScale) * 1e7), Math.round(origin[1] + y / (radians * earthRadiusMm) * 1e7)];
const TAU = Math.PI * 2, wrap = (v: number) => ((v % TAU) + TAU) % TAU;

function centre(p: Pose, side: 'L' | 'R', r: number) {
  const s = side === 'L' ? 1 : -1;
  return { x: p.x - s * r * Math.sin(p.a), y: p.y + s * r * Math.cos(p.a) };
}
function advance(p: Pose, kind: Segment['kind'], length: number, r: number): Pose {
  if (kind === 'S') return { x: p.x + length * Math.cos(p.a), y: p.y + length * Math.sin(p.a), a: p.a };
  const c = centre(p, kind, r), turn = (kind === 'L' ? 1 : -1) * length / r, angle = Math.atan2(p.y - c.y, p.x - c.x) + turn;
  return { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle), a: p.a + turn };
}
/** The shortest of the six Dubins words from a to b, keeping only words that really arrive at b. */
function dubins(a: Pose, b: Pose, r: number): { word: string; segments: Segment[]; length: number } {
  const paths: { word: string; segments: Segment[] }[] = [];
  for (const word of ['LSL', 'RSR', 'LSR', 'RSL'] as const) {
    const s0 = word[0] as 'L' | 'R', s1 = word[2] as 'L' | 'R', c0 = centre(a, s0, r), c1 = centre(b, s1, r);
    const vx = c1.x - c0.x, vy = c1.y - c0.y, d = Math.hypot(vx, vy);
    let u: number, straight: number;
    // Coinciding circles (an exact fillet) make one arc: the whole turn on one circle, no straight.
    if (s0 === s1) { u = d < 5 ? a.a : Math.atan2(vy, vx); straight = d < 5 ? 0 : d; }
    else {
      if (d < 2 * r) continue;
      straight = Math.sqrt(d * d - 4 * r * r);
      u = Math.atan2(vy, vx) + (s0 === 'L' ? 1 : -1) * Math.atan2(2 * r, straight);
    }
    const t = s0 === 'L' ? wrap(u - a.a) : wrap(a.a - u), q = s1 === 'L' ? wrap(b.a - u) : wrap(u - b.a);
    paths.push({ word, segments: [{ kind: s0, length: t * r }, { kind: 'S', length: straight }, { kind: s1, length: q * r }] });
  }
  for (const word of ['LRL', 'RLR'] as const) {
    const s0 = word[0] as 'L' | 'R', s1 = word[1] as 'L' | 'R', c0 = centre(a, s0, r), c1 = centre(b, s0, r);
    const vx = c1.x - c0.x, vy = c1.y - c0.y, d = Math.hypot(vx, vy);
    if (d > 4 * r || d < 1e-6) continue;
    for (const sign of [1, -1]) {
      const g = Math.atan2(vy, vx) + sign * Math.acos(d / (4 * r)), middle = { x: c0.x + 2 * r * Math.cos(g), y: c0.y + 2 * r * Math.sin(g) };
      const p1 = Math.atan2(middle.y - c0.y, middle.x - c0.x), p2 = Math.atan2(c1.y - middle.y, c1.x - middle.x);
      // Heading on the first circle where it meets the middle one, then on the middle circle where it meets the last.
      const h1 = s0 === 'L' ? p1 + Math.PI / 2 : p1 - Math.PI / 2, h2 = s0 === 'L' ? p2 - Math.PI / 2 : p2 + Math.PI / 2;
      const t = s0 === 'L' ? wrap(h1 - a.a) : wrap(a.a - h1), m = s1 === 'L' ? wrap(h2 - h1) : wrap(h1 - h2), q = s0 === 'L' ? wrap(b.a - h2) : wrap(h2 - b.a);
      paths.push({ word, segments: [{ kind: s0, length: t * r }, { kind: s1, length: m * r }, { kind: s0, length: q * r }] });
    }
  }
  const arriving = paths.map(path => ({ ...path, length: path.segments.reduce((sum, seg) => sum + seg.length, 0) })).filter(path => {
    let p = a; for (const seg of path.segments) p = advance(p, seg.kind, seg.length, r);
    return Math.hypot(p.x - b.x, p.y - b.y) < 1 && Math.abs(Math.atan2(Math.sin(p.a - b.a), Math.cos(p.a - b.a))) < 1e-6;
  }).sort((x, y) => x.length - y.length);
  if (!arriving[0]) throw new Error('No Dubins path between the anchors.');
  return arriving[0];
}
function along(a: Pose, segments: Segment[], r: number, at: number): Pose {
  let p = a;
  for (const seg of segments) { if (at <= seg.length) return advance(p, seg.kind, at, r); p = advance(p, seg.kind, seg.length, r); at -= seg.length; }
  return p;
}

let points: Point[] = trace.points.map(p => ({ ...p, positionE7: [...p.positionE7] as [number, number] }));
const find = (name: string) => { const i = points.findIndex(p => p.id === name); if (i < 0) throw new Error(`${id}: no control point ${name}`); return i; };
for (const trim of spec.trims ?? []) points[find(trim.point)]!.cornerTrimMm = trim.cornerTrimMm;
for (const edit of spec.edits) {
  let from = edit.from, to = edit.to;
  if (edit.fillet) {
    // A single arc touches each leg R·tan(θ/2) from the corner.
    const k = find(edit.fillet), u = local(points[k - 1]!), v = local(points[k]!), w = local(points[k + 1]!);
    const turn = Math.atan2(w.y - v.y, w.x - v.x) - Math.atan2(v.y - u.y, v.x - u.x);
    const reach = Math.round(edit.radiusMm * Math.tan(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) / 2));
    from = { point: edit.fillet, back: reach }; to = { point: edit.fillet, along: reach };
  }
  if (!from || !to) throw new Error(`${edit.name}: an edit needs from and to, or a fillet.`);
  // An anchor lies on one edge: `along` mm after its point on the edge leaving it, or `back` mm before it on the
  // edge arriving at it; with neither it is the point itself, and `heading` picks which edge's heading to keep.
  const anchor = (k: number, end: Anchor, fallback: 'in' | 'out') => {
    const after = end.along ?? 0, before = end.back ?? 0, forward = after > 0 || before === 0 && (end.heading ?? fallback) === 'out';
    const u = points[forward ? k : k - 1]!, v = points[forward ? k + 1 : k]!, a = local(u), b = local(v);
    const length = Math.hypot(b.x - a.x, b.y - a.y), heading = Math.atan2(b.y - a.y, b.x - a.x), offset = forward ? after : length - before;
    return { pose: { x: a.x + offset * Math.cos(heading), y: a.y + offset * Math.sin(heading), a: heading },
      elevation: u.elevationMm + (v.elevationMm - u.elevationMm) * offset / length, onPoint: after === 0 && before === 0 };
  };
  const i = find(from.point), j = find(to.point), start = anchor(i, from, 'out'), end = anchor(j, to, 'in');
  const first = (from.back ?? 0) > 0 ? i : i + 1, last = (to.along ?? 0) > 0 ? j : j - 1, removed = points.slice(first, last + 1);
  const path = dubins(start.pose, end.pose, edit.radiusMm), cells = Math.max(1, Math.floor(path.length / 5300));
  const nearest = <T extends Point>(x: number, y: number, among: T[]) => among.reduce((best, p) => {
    const c = local(p), d = Math.hypot(c.x - x, c.y - y); return d < best.d ? { d, p } : best;
  }, { d: Infinity, p: undefined as T | undefined });
  const make = (pose: Pose, k: number, f: number): Point => ({
    id: `${edit.name}-${String(k).padStart(2, '0')}`, positionE7: e7(pose.x, pose.y),
    elevationMm: Math.round(start.elevation + (end.elevation - start.elevation) * f),
    halfWidthMm: Math.max(...[points[i]!, points[j]!, ...removed].map(p => p.halfWidthMm)),
    sector: nearest(pose.x, pose.y, removed).p?.sector ?? points[i]!.sector, cornerTrimMm: 100000,
  });
  const fresh: Point[] = [];
  if (!start.onPoint) fresh.push(make(start.pose, 0, 0));
  for (let k = 1; k < cells; k++) fresh.push(make(along(start.pose, path.segments, edit.radiusMm, path.length * k / cells), k, k / cells));
  if (!end.onPoint) fresh.push(make(end.pose, cells, 1));
  for (const gate of removed.filter(p => p.gate)) {
    const g = local(gate), target = nearest(g.x, g.y, fresh).p;
    if (!target || target.gate) throw new Error(`${edit.name}: cannot place gate ${gate.id}.`);
    Object.assign(target, { id: gate.id, gate: true, sector: gate.sector });
  }
  points = [...points.slice(0, first), ...fresh, ...points.slice(last + 1)];
}
// An opened bend is shorter, so its climb steepens: ease any edge over maxGrade by moving both of its points'
// elevations toward each other until every edge complies. The route's ends stay where they are.
if (spec.maxGrade) {
  const span = points.slice(1).map((p, k) => { const a = local(points[k]!), b = local(p); return Math.hypot(b.x - a.x, b.y - a.y); });
  const h = points.map(p => p.elevationMm);
  for (let round = 0, steep = true; steep && round < 5000; round++) {
    steep = false;
    for (let k = 0; k < span.length; k++) {
      const rise = h[k + 1]! - h[k]!, excess = Math.abs(rise) - span[k]! * spec.maxGrade;
      if (excess <= 0.5) continue;
      steep = true;
      const move = Math.sign(rise) * excess / 2;
      if (k > 0) h[k]! += k + 1 === h.length - 1 ? move * 2 : move;
      if (k + 1 < h.length - 1) h[k + 1]! -= k === 0 ? move * 2 : move;
    }
  }
  points.forEach((p, k) => { p.elevationMm = Math.round(h[k]!); });
}

const opened = { ...authoring, points };
compileStreetTrack(opened); // the real compiler rejects anything it would reject in a build
if (flag === '--check') {
  if (JSON.stringify(points) !== JSON.stringify(authoring.points)) throw new Error(`${authoringPath} is not the trace with ${id}.bends.json applied.`);
  console.log(`${authoringPath}: the trace with ${spec.edits.length} opened bend${spec.edits.length === 1 ? '' : 's'}.`);
} else {
  await writeFile(authoringPath, JSON.stringify(opened, null, 2) + '\n');
  console.log(`Wrote ${authoringPath}: ${spec.edits.length} opened bend${spec.edits.length === 1 ? '' : 's'}, ${points.length} control points.`);
}
