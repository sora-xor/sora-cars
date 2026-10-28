import type { CompiledStreetTrack } from './track';

/** Immutable application catalog; the native profile compiles the same rows.
 * This is authoring data, not permission to install or modify a ledger profile.
 */
export type StreetObjectKind = 'oil' | 'tree_planter' | 'breakaway_sign';
export interface StreetObject {
  readonly id: string;
  readonly kind: StreetObjectKind;
  readonly progressMm: number;
  readonly lateralMm: number;
  readonly halfLengthMm: number;
  readonly halfWidthMm: number;
}
export interface CompiledStreetObjects {
  readonly version: 1;
  readonly trackId: string;
  /** Index is the bit position in the native world's broken-object mask. */
  readonly objects: readonly StreetObject[];
}

function reject(message: string): never { throw new RangeError(`Street objects: ${message}`); }
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{2,47}$/.test(value);
export function streetObjectInteger(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < low || value > high) reject(`invalid ${label}.`);
  return value === 0 ? 0 : value;
}
function plainRecord(value: unknown): asserts value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) reject('expected a plain data record.');
}
function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) reject(`expected own data property ${key}.`);
  return descriptor.value;
}
/** Shared boundary readers for runtime catalog admission and offline authoring.
 * Descriptor values are captured once; no user-supplied collection method runs.
 */
export function streetObjectRecord(value: unknown, fields: readonly string[]): Readonly<Record<string, unknown>> {
  plainRecord(value);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) reject('unexpected record fields.');
  const captured: Record<string, unknown> = Object.create(null);
  for (const field of fields) captured[field] = ownData(value, field);
  return Object.freeze(captured);
}
export function streetObjectArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) reject('expected a plain dense array.');
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) reject('invalid array length.');
  const length = streetObjectInteger(lengthDescriptor.value, 0, maximum, 'array length');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || keys.some(key => key !== 'length'
    && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) reject('unexpected array fields or holes.');
  const captured: unknown[] = [];
  for (let i = 0; i < length; i++) captured.push(ownData(value, String(i)));
  return Object.freeze(captured);
}

export interface StreetObjectRoad {
  readonly id: string;
  readonly topology: CompiledStreetTrack['topology'];
  readonly lengthMm: number;
  readonly samples: readonly { readonly progressMm: number; readonly halfWidthMm: number }[];
}
/** Capture the station/width subset used by object containment. The native
 * geometry admission separately validates coordinates, headings and topology.
 */
export function streetObjectRoad(track: CompiledStreetTrack): StreetObjectRoad {
  plainRecord(track);
  const id = ownData(track, 'id'), topology = ownData(track, 'topology');
  if (!identifier(id) || topology !== 'circuit' && topology !== 'sprint') reject('invalid track identity or topology.');
  const lengthMm = streetObjectInteger(ownData(track, 'lengthMm'), 500_000, 20_000_000, 'track length');
  const rows = streetObjectArray(ownData(track, 'samples'), 4001), cells = Math.ceil(lengthMm / 5000);
  if (rows.length !== cells + 1) reject('invalid station count.');
  const samples = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]; plainRecord(raw);
    const expected = Math.floor((i * lengthMm + Math.floor(cells / 2)) / cells);
    samples.push(Object.freeze({
      progressMm: streetObjectInteger(ownData(raw, 'progressMm'), expected, expected, 'station'),
      halfWidthMm: streetObjectInteger(ownData(raw, 'halfWidthMm'), 2500, 12000, 'road width'),
    }));
  }
  if (topology === 'circuit' && samples[0]!.halfWidthMm !== samples.at(-1)!.halfWidthMm) reject('circuit width does not close.');
  return Object.freeze({ id, topology, lengthMm, samples: Object.freeze(samples) });
}

/** Snapshot a closed, ordered catalog, then revalidate the native bounds and
 * full footprint against frozen stepwise road widths. Catalog IDs affect art;
 * kind and integer rows select the native computation. Empty catalogs are valid.
 */
export function snapshotStreetObjectCatalog(track: CompiledStreetTrack, value: unknown): CompiledStreetObjects {
  const road = streetObjectRoad(track), source = streetObjectRecord(value, ['version', 'trackId', 'objects']);
  if (source.version !== 1 || source.trackId !== road.id) reject('invalid catalog version or track binding.');
  const rows = streetObjectArray(source.objects, 16), ids = new Set<string>(), objects: StreetObject[] = [];
  for (const raw of rows) {
    const row = streetObjectRecord(raw, ['id', 'kind', 'progressMm', 'lateralMm', 'halfLengthMm', 'halfWidthMm']);
    const id = row.id, kind = row.kind;
    if (!identifier(id) || ids.has(id) || kind !== 'oil' && kind !== 'tree_planter' && kind !== 'breakaway_sign') reject('invalid object identity or kind.');
    const oil = kind === 'oil';
    const halfLengthMm = streetObjectInteger(row.halfLengthMm, oil ? 6000 : 250, oil ? 20000 : 1500, 'half length');
    const halfWidthMm = streetObjectInteger(row.halfWidthMm, oil ? 500 : 200, oil ? 2400 : 1500, 'half width');
    const lateralMm = streetObjectInteger(row.lateralMm, -16000, 16000, 'lateral position');
    const finishSpace = road.topology === 'circuit' ? 14000 : 6000;
    const progressMm = streetObjectInteger(row.progressMm, 14000 + halfLengthMm, road.lengthMm - finishSpace - halfLengthMm, 'protected grid/finish placement');
    if (road.topology === 'circuit' && 2 * (halfLengthMm + 1800 + 6000) >= road.lengthMm) reject('roadside contact image is not unique.');
    const begin = progressMm - halfLengthMm, end = progressMm + halfLengthMm;
    let i = 0;
    while (i + 1 < road.samples.length && road.samples[i + 1]!.progressMm <= begin) i++;
    let width = road.samples[i]!.halfWidthMm;
    while (++i < road.samples.length && road.samples[i]!.progressMm <= end) width = Math.min(width, road.samples[i]!.halfWidthMm);
    if (Math.abs(lateralMm) + halfWidthMm > width) reject('object footprint extends outside the road corridor.');
    ids.add(id); objects.push(Object.freeze({ id, kind, progressMm, lateralMm, halfLengthMm, halfWidthMm }));
  }
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i]!, b = objects[j]!;
    if (a.kind === 'oil' || b.kind === 'oil') continue;
    const directGap = Math.abs(a.progressMm - b.progressMm);
    const gap = road.topology === 'circuit' ? Math.min(directGap, road.lengthMm - directGap) : directGap;
    if (gap < a.halfLengthMm + b.halfLengthMm
      && Math.abs(a.lateralMm - b.lateralMm) < a.halfWidthMm + b.halfWidthMm) reject('breakaway prop footprints overlap.');
  }
  return Object.freeze({ version: 1, trackId: road.id, objects: Object.freeze(objects) });
}
