import type { CompiledStreetTrack } from '../../src/game/street/track';
import { snapshotStreetObjectCatalog, streetObjectArray, streetObjectInteger, streetObjectRecord, streetObjectRoad,
  type CompiledStreetObjects, type StreetObjectKind } from '../../src/game/street/objects';

export interface AuthoredStreetObjects {
  version: 1;
  trackId: string;
  objects: readonly {
    id: string; kind: StreetObjectKind; anchorGate: string; offsetMm: number;
    lateralMm: number; halfLengthMm: number; halfWidthMm: number;
  }[];
}
function reject(message: string): never { throw new RangeError(`Street objects: ${message}`); }

/** Freeze gate-relative authoring into native integer rectangles. These are
 * arcade oil zones and breakaway props, not surveyed historical obstacles.
 */
export function compileStreetObjects(track: CompiledStreetTrack, source: AuthoredStreetObjects): CompiledStreetObjects {
  const road = streetObjectRoad(track), authored = streetObjectRecord(source, ['version', 'trackId', 'objects']);
  if (authored.version !== 1 || authored.trackId !== road.id) reject('invalid track binding.');
  const gateDescriptor = Object.getOwnPropertyDescriptor(track, 'gates');
  if (!gateDescriptor || !Object.hasOwn(gateDescriptor, 'value') || !gateDescriptor.enumerable) reject('expected own gate data.');
  const gates = new Map<string, number>();
  let previous = -1;
  for (const raw of streetObjectArray(gateDescriptor.value, 256)) {
    const row = streetObjectRecord(raw, ['id', 'sample']);
    if (typeof row.id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(row.id) || gates.has(row.id)) reject('invalid or duplicate gate.');
    const sample = streetObjectInteger(row.sample, previous + 1, road.samples.length - 1, 'gate sample');
    gates.set(row.id, road.samples[sample]!.progressMm); previous = sample;
  }
  const objects = [];
  for (const raw of streetObjectArray(authored.objects, 16)) {
    const row = streetObjectRecord(raw, ['id', 'kind', 'anchorGate', 'offsetMm', 'lateralMm', 'halfLengthMm', 'halfWidthMm']);
    if (typeof row.anchorGate !== 'string') reject('invalid anchor gate.');
    const gate = gates.get(row.anchorGate) ?? reject('unknown anchor gate.');
    const offsetMm = streetObjectInteger(row.offsetMm, -200000, 200000, 'anchor offset');
    objects.push({ id: row.id, kind: row.kind, progressMm: gate + offsetMm, lateralMm: row.lateralMm,
      halfLengthMm: row.halfLengthMm, halfWidthMm: row.halfWidthMm });
  }
  return snapshotStreetObjectCatalog(track, { version: 1, trackId: road.id, objects });
}

/** Only validated geometry/kind rows go into the compiled native relation;
 * revalidate against the track immediately before interpolating Rust integers.
 */
export function streetObjectRustTable(catalog: CompiledStreetObjects, track: CompiledStreetTrack): string {
  const captured = snapshotStreetObjectCatalog(track, catalog);
  const kinds: Record<StreetObjectKind, string> = { oil: 'Oil', tree_planter: 'TreePlanter', breakaway_sign: 'BreakawaySign' };
  return `pub fn hazards() -> Vec<crate::hazards::Hazard> { vec![\n${captured.objects.map(o =>
    `    crate::hazards::Hazard { kind: crate::hazards::Kind::${kinds[o.kind]}, progress_mm: ${o.progressMm}, lateral_mm: ${o.lateralMm}, half_length_mm: ${o.halfLengthMm}, half_width_mm: ${o.halfWidthMm} },`).join('\n')}\n] }\n`;
}
