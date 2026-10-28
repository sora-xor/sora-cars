import type { CompiledStreetTrack, StreetSample } from '../../src/game/street/track';

export interface AuthoredStreetTrack {
  version: 1; id: string; name: { ja: string; en: string }; year: 1986;
  topology: CompiledStreetTrack['topology'];
  /** Longitude, latitude in E7; authoring inputs only, never runtime floating point. */
  points: readonly { id: string; positionE7: readonly [number, number]; elevationMm: number; halfWidthMm: number; sector: number; cornerTrimMm: number; gate?: boolean }[];
  laps: number; maxTicks: number; targetMs: number;
  sound: CompiledStreetTrack['sound'];
}
type Point = { x: number; y: number; h: number; width: number; sector: number };
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const interpolate = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: a.h + (b.h - a.h) * t, width: a.width + (b.width - a.width) * t, sector: t < 0.5 ? a.sector : b.sector });
const int = (value: number, low: number, high: number) => Number.isSafeInteger(value) && value >= low && value <= high;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: object, allowed: string) => Object.keys(value).every(key => allowed.split(' ').includes(key));
const label = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 96 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const reject = (message: string): never => { throw new RangeError(`Street track: ${message}`); };
const wrapTurn = (value: number) => ((value + 500000) % 1000000 + 1000000) % 1000000 - 500000;

/** Detect crossings/touches on the quantized centerline. All coordinate
 * differences are <=30,000,000 mm, so orientation products remain JS-exact.
 * Grade-separated crossings need an explicit topology, absent from this format.
 */
function rejectCrossings(samples: StreetSample[], topology: CompiledStreetTrack['topology']): void {
  const orient = (a: StreetSample, b: StreetSample, c: StreetSample) => (b.eastMm - a.eastMm) * (c.northMm - a.northMm) - (b.northMm - a.northMm) * (c.eastMm - a.eastMm);
  const overlaps = (a: number, b: number, c: number, d: number) => Math.max(Math.min(a, b), Math.min(c, d)) <= Math.min(Math.max(a, b), Math.max(c, d));
  for (let i = 0; i < samples.length - 1; i++) for (let j = i + 2; j < samples.length - 1; j++) {
    if (topology === 'circuit' && i === 0 && j === samples.length - 2) continue;
    const a = samples[i]!, b = samples[i + 1]!, c = samples[j]!, d = samples[j + 1]!;
    if (!overlaps(a.eastMm, b.eastMm, c.eastMm, d.eastMm) || !overlaps(a.northMm, b.northMm, c.northMm, d.northMm)) continue;
    const abC = Math.sign(orient(a, b, c)), abD = Math.sign(orient(a, b, d)), cdA = Math.sign(orient(c, d, a)), cdB = Math.sign(orient(c, d, b));
    if (abC * abD <= 0 && cdA * cdB <= 0) reject(`centerline intersects between samples ${i} and ${j}; crossing topology is unsupported.`);
  }
}

/** Offline authoring: freeze the local geographic projection and curve sampling
 * into integer tables. Validators and browser physics never rerun these floats.
 */
export function compileStreetTrack(source: AuthoredStreetTrack): CompiledStreetTrack {
  if (!record(source) || !keys(source, 'version topology id name year points laps maxTicks targetMs sound authoringNotes sources')
    || source.version !== 1 || source.year !== 1986 || typeof source.id !== 'string' || !/^[a-z][a-z0-9-]{2,47}$/.test(source.id)
    || source.topology !== 'circuit' && source.topology !== 'sprint'
    || !record(source.name) || !keys(source.name, 'ja en') || !label(source.name.ja) || !label(source.name.en)
    || !Array.isArray(source.points) || source.points.length < (source.topology === 'circuit' ? 4 : 2) || source.points.length > 256
    || !int(source.laps, 1, source.topology === 'sprint' ? 1 : 4) || !int(source.maxTicks, 30, 9000) || !int(source.targetMs, 1000, source.maxTicks * 1000 / 30)) reject('invalid identity, topology, points or duration.');
  const ids = new Set<string>();
  for (const point of source.points) {
    if (!record(point) || !keys(point, 'id positionE7 elevationMm halfWidthMm sector cornerTrimMm gate')
      || typeof point.id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(point.id) || ids.has(point.id)
      || !Array.isArray(point.positionE7) || point.positionE7.length !== 2
      || !int(point.positionE7[0], -1800000000, 1800000000) || !int(point.positionE7[1], -800000000, 800000000)
      || !int(point.elevationMm, -100000, 4000000) || !int(point.halfWidthMm, 2500, 12000)
      || !int(point.sector, 0, 31) || !int(point.cornerTrimMm, 0, 100000)
      || point.gate !== undefined && typeof point.gate !== 'boolean') reject('invalid or duplicate control point.');
    ids.add(point.id);
  }
  const sound = source.sound;
  if (!record(sound) || !keys(sound, 'asset sha256 durationMs cuesMs') || typeof sound.asset !== 'string' || !/^[a-z0-9-]+\.(ogg|m4a|mid)$/.test(sound.asset)
    || typeof sound.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sound.sha256)
    || !int(sound.durationMs, 1000, 300000) || Math.abs(sound.durationMs - source.targetMs) > 1000
    || !Array.isArray(sound.cuesMs) || sound.cuesMs.length < 2 || sound.cuesMs.length > 32 || sound.cuesMs[0] !== 0
    || Array.from(sound.cuesMs).some((cue, i) => !int(cue, 0, sound.durationMs - 1) || i > 0 && cue <= sound.cuesMs[i - 1]!)) reject('invalid soundtrack or cue schedule.');
  const origin = source.points[0]!.positionE7;
  const radians = Math.PI / 180, earthRadiusMm = 6371008800;
  const longitudeScale = Math.cos(origin[1] / 1e7 * radians);
  const points: Point[] = source.points.map(p => ({ x: (p.positionE7[0] - origin[0]) / 1e7 * radians * earthRadiusMm * longitudeScale,
    y: (p.positionE7[1] - origin[1]) / 1e7 * radians * earthRadiusMm, h: p.elevationMm, width: p.halfWidthMm, sector: p.sector }));
  if (points.some(p => Math.abs(p.x) > 15000000 || Math.abs(p.y) > 15000000)) reject('route exceeds local projection extent.');
  const circuit = source.topology === 'circuit';
  for (let i = 0; i < points.length - (circuit ? 0 : 1); i++) if (distance(points[i]!, points[(i + 1) % points.length]!) < 5000) reject('control points are less than five metres apart.');
  if (!circuit && distance(points[0]!, points.at(-1)!) < 5000) reject('sprint endpoints must be distinct and at least five metres apart.');

  // Quadratic tangent trims are intentionally not named radii. Start at the
  // midpoint of the first fillet, then close through its other half.
  const corners = points.map((point, i) => {
    // A sprint has real starting and finishing positions, never a hidden return
    // leg or endpoint fillet based on the opposite end of the route.
    if (!circuit && (i === 0 || i === points.length - 1)) return [point];
    const before = points[(i + points.length - 1) % points.length]!, after = points[(i + 1) % points.length]!;
    const trim = Math.min(source.points[i]!.cornerTrimMm, distance(before, point) * 0.3, distance(point, after) * 0.3);
    if (!trim) return [point];
    const entry = interpolate(point, before, trim / distance(point, before)), exit = interpolate(point, after, trim / distance(point, after));
    return Array.from({ length: 13 }, (_, part) => {
      const t = part / 12;
      return interpolate(interpolate(entry, point, t), interpolate(point, exit, t), t);
    });
  });
  const first = corners[0]!, firstMiddle = Math.floor(first.length / 2);
  const dense: Point[] = first.slice(firstMiddle);
  const gateDenseIndices = [0];
  for (let i = 1; i < corners.length; i++) { gateDenseIndices.push(dense.length + Math.floor(corners[i]!.length / 2)); dense.push(...corners[i]!); }
  if (circuit) dense.push(...first.slice(0, firstMiddle + 1));
  const cumulative = [0];
  for (let i = 1; i < dense.length; i++) {
    const span = distance(dense[i - 1]!, dense[i]!);
    if (!Number.isFinite(span) || span <= 0) reject('degenerate smoothed edge.');
    cumulative.push(cumulative[i - 1]! + span);
  }
  const lengthMm = Math.round(cumulative.at(-1)!);
  if (!int(lengthMm, 500000, 20000000)) reject('length outside 0.5–20 km.');
  const samples: StreetSample[] = [];
  // Distribute integer stations evenly. A tiny length%5000 closing cell would
  // turn millimetre coordinate quantization into an arbitrarily sharp heading.
  const cells = Math.ceil(lengthMm / 5000);
  const sectionStarts = gateDenseIndices.map(index => Math.min(circuit ? cells - 1 : cells, Math.round(cumulative[index]! * cells / lengthMm)));
  if (sectionStarts.some((start, i) => i > 0 && start <= sectionStarts[i - 1]!)) reject('control point sections are too close for the compiled sampling resolution.');
  let edge = 0, section = 0;
  for (let cell = 0; cell < cells; cell++) {
    const progress = Math.round(cell * lengthMm / cells);
    while (edge + 1 < dense.length - 1 && cumulative[edge + 1]! <= progress) edge++;
    while (section + 1 < sectionStarts.length && sectionStarts[section + 1]! <= cell) section++;
    const t = (progress - cumulative[edge]!) / (cumulative[edge + 1]! - cumulative[edge]!);
    const point = interpolate(dense[edge]!, dense[edge + 1]!, t);
    // Section changes and gates share the snapped authored midpoint. Continuous
    // geometry never interpolates categorical scenery/traffic section IDs.
    point.sector = source.points[section]!.sector;
    samples.push({ progressMm: progress, eastMm: Math.round(point.x) || 0, northMm: Math.round(point.y) || 0,
      elevationMm: Math.round(point.h) || 0, halfWidthMm: Math.round(point.width), headingMicroturn: 0, turnPerMetre: 0, sector: point.sector });
  }
  const finish = points.at(-1)!;
  samples.push(circuit ? { ...samples[0]!, progressMm: lengthMm } : {
    progressMm: lengthMm, eastMm: Math.round(finish.x) || 0, northMm: Math.round(finish.y) || 0,
    elevationMm: Math.round(finish.h) || 0, halfWidthMm: Math.round(finish.width), headingMicroturn: 0, turnPerMetre: 0, sector: finish.sector,
  });
  const chordHeadings: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const p = samples[i]!, q = samples[i + 1]!, span = Math.hypot(q.eastMm - p.eastMm, q.northMm - p.northMm);
    if (span < 1 || !Number.isFinite(span)) reject('quantized zero-length edge.');
    if (Math.abs(q.elevationMm - p.elevationMm) * 1000 > span * 180) reject('grade exceeds 18% design bound.');
    if (Math.abs(q.halfWidthMm - p.halfWidthMm) * 1000 > span * 250) reject('road width changes too abruptly.');
    chordHeadings.push(Math.round(Math.atan2(q.eastMm - p.eastMm, q.northMm - p.northMm) / (Math.PI * 2) * 1000000) || 0);
  }
  rejectCrossings(samples, source.topology);
  for (let i = 0; i < samples.length - 1; i++) {
    const previous = samples[i === 0 ? samples.length - 2 : i - 1]!, point = samples[i]!, next = samples[i + 1]!;
    const turn = !circuit && i === 0 ? 0 : wrapTurn(chordHeadings[i]! - chordHeadings[i === 0 ? chordHeadings.length - 1 : i - 1]!);
    const spanMm = (Math.hypot(point.eastMm - previous.eastMm, point.northMm - previous.northMm) + Math.hypot(next.eastMm - point.eastMm, next.northMm - point.northMm)) / 2;
    point.turnPerMetre = Math.round(turn * 1000 / spanMm) || 0;
    if (Math.abs(point.turnPerMetre) > 40000 || Math.abs(point.turnPerMetre) * point.halfWidthMm > 79000000) reject('curvature/width exceeds local design bound; increase the corner trim.');
    point.headingMicroturn = i === 0 ? chordHeadings[0]! : previous.headingMicroturn + wrapTurn(chordHeadings[i]! - chordHeadings[i - 1]!);
    if (!int(point.headingMicroturn, -2000000, 2000000)) reject('unwrapped heading exceeds native integer bounds.');
  }
  const last = samples.at(-1)!, beforeLast = samples.at(-2)!;
  last.headingMicroturn = beforeLast.headingMicroturn + (circuit ? wrapTurn(chordHeadings[0]! - chordHeadings.at(-1)!) : 0);
  last.turnPerMetre = circuit ? samples[0]!.turnPerMetre : 0;
  if (!int(last.headingMicroturn, -2000000, 2000000)) reject('unwrapped heading exceeds native integer bounds.');
  if (circuit && Math.abs(last.headingMicroturn - samples[0]!.headingMicroturn) !== 1000000) reject('closed centerline must have one complete winding.');
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!, b = samples[i + 1]!;
    if (Math.abs(b.headingMicroturn - a.headingMicroturn) * Math.max(a.halfWidthMm, b.halfWidthMm) * 1000
      > 79000000 * (b.progressMm - a.progressMm)) reject('interpolated heading/width exceeds the local design bound.');
  }
  const gates = source.points.flatMap((point, i) => point.gate ? [{ id: point.id, sample: sectionStarts[i]! }] : []);
  if (gates.length < (circuit ? 4 : 2) || gates[0]?.sample !== 0 || !circuit && gates.at(-1)?.sample !== cells
    || gates.some((g, i) => i > 0 && g.sample <= gates[i - 1]!.sample)) reject('gates must begin at start and progress strictly; a sprint must end with a finish gate.');
  return { version: 1, topology: source.topology, id: source.id, name: { ...source.name }, year: 1986, originE7: [...origin], lengthMm, laps: source.laps,
    maxTicks: source.maxTicks, targetMs: source.targetMs, samples, gates, sound: { ...sound, cuesMs: [...sound.cuesMs] },
    qualification: { historicalAlignment: false, nativeParity: false, proof: false } };
}

/** Exact integer rows for a future reviewed native relation; this installs no verifier. */
export function streetRustTable(track: CompiledStreetTrack): string {
  if (track.topology !== 'circuit' && track.topology !== 'sprint') reject('invalid compiled topology.');
  return `// Generated by scripts/compile-street-tracks.ts. Unqualified authoring geometry.\n// Consumer exposes world/native/street_geometry.rs as crate::geometry.\n// ${track.id}: progress_mm, east_mm, north_mm, elevation_mm, half_width_mm, heading_microturn, turn_per_metre, sector.\npub const TOPOLOGY: crate::geometry::Topology = crate::geometry::Topology::${track.topology === 'circuit' ? 'Circuit' : 'Sprint'};\npub const LENGTH_MM: i64 = ${track.lengthMm};\npub const MAX_TICKS: u32 = ${track.maxTicks};\npub const LAPS: u32 = ${track.laps};\npub const ROAD: [[i64; 8]; ${track.samples.length}] = [\n${track.samples.map(p => `    [${[p.progressMm, p.eastMm, p.northMm, p.elevationMm, p.halfWidthMm, p.headingMicroturn, p.turnPerMetre, p.sector].join(', ')}],`).join('\n')}\n];\npub const GATES: [usize; ${track.gates.length}] = [${track.gates.map(g => g.sample).join(', ')}];\n`;
}
