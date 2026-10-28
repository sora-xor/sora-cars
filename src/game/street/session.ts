import { createStreetGraphExecutor, type StreetGraph, type StreetGraphExecutor } from './graph';
import { snapshotStreetObjectCatalog, streetObjectArray, streetObjectRecord, type StreetObject } from './objects';
import type { CompiledStreetTrack } from './track';
import { STREET_CAR_FIELDS, STREET_STATE_HEADER_FIELDS } from './generated/layout-v1';
export { STREET_CAR_FIELDS } from './generated/layout-v1';

/** Local development bundle. Never accepted by the live game/proof client. */
export interface StreetRaceBundle {
  version: 1;
  domain: 'sora-cars.street-race-draft.v1';
  roster: number;
  track: CompiledStreetTrack;
  objects: readonly StreetObject[];
  graph: StreetGraph;
  initialInputs: readonly number[];
  initialOutputs: Readonly<Record<string, number>>;
  sources: Readonly<Record<string, string>>;
  qualification: { proof: false; consensus: false; playability: false };
}
export interface StreetCarState {
  progressMm: number; lateralMm: number; speedMmPerTick: number;
  bodyYawMicroturn: number; velocityYawMicroturn: number; energy: number;
  nextGate: number; status: number; finishTick: number;
  finishNumerator: number; finishDenominator: number;
  rank: number; boosting: number; drifting: number; wallContact: number; carContact: number;
  oil: number; oilCrossed: number; propHitMask: number;
  skin: number;
}
export interface StreetRaceState {
  tick: number; done: boolean; worldBrokenMask: number; rain: number; windMmPerTick: number;
  refundAllForfeit: boolean; technicalWin: boolean; cars: readonly StreetCarState[];
}
const FEEDBACK = ['rank', 'boosting', 'drifting', 'wallContact', 'carContact', 'oil', 'oilCrossed', 'propHitMask'] as const;

/** Detach the public bundle as well as the executor's inputs. Rendering, AI and
 * replay downloads must keep describing the same data after caller mutation.
 * This captures bounded JSON data only; it never invokes supplied accessors,
 * iterators, toJSON functions or collection methods. It does not authenticate a
 * compiled profile or turn an arbitrary local graph into an admitted proof.
 */
function snapshotBundle(value: StreetRaceBundle): StreetRaceBundle {
  const active = new Set<object>();
  let remainingValues = 2_000_000, remainingCharacters = 32_000_000;
  const reject = (): never => { throw new RangeError('Street bundle must contain bounded plain data.'); };
  const text = (value: string): string => {
    remainingCharacters -= value.length;
    if (value.length > 8192 || remainingCharacters < 0) return reject();
    return value;
  };
  const capture = (raw: unknown, depth: number): unknown => {
    if (--remainingValues < 0 || depth > 16) return reject();
    if (raw === null || typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return Number.isSafeInteger(raw) ? raw === 0 ? 0 : raw : reject();
    if (typeof raw === 'string') return text(raw);
    if (!raw || typeof raw !== 'object' || active.has(raw)) return reject();
    active.add(raw);
    let result: unknown;
    if (Array.isArray(raw)) {
      const rows = streetObjectArray(raw, 131_072), captured: unknown[] = [];
      for (let i = 0; i < rows.length; i++) captured.push(capture(rows[i], depth + 1));
      result = Object.freeze(captured);
    } else {
      const keys = Reflect.ownKeys(raw);
      if (keys.length > 2048 || keys.some(key => typeof key !== 'string')) return reject();
      const fields = keys as string[], record = streetObjectRecord(raw, fields);
      const captured: Record<string, unknown> = {};
      for (const key of fields) Object.defineProperty(captured, text(key), {
        value: capture(record[key], depth + 1), enumerable: true, writable: false, configurable: false,
      });
      result = Object.freeze(captured);
    }
    active.delete(raw);
    return result;
  };
  return capture(value, 0) as StreetRaceBundle;
}

function catalogConstants(objects: readonly StreetObject[]): Readonly<Record<string, number>> {
  const result: Record<string, number> = { 'catalog.count': objects.length };
  for (let i = 0; i < objects.length; i++) {
    const object = objects[i]!;
    result[`catalog.o${i}.kind`] = object.kind === 'oil' ? 0 : object.kind === 'tree_planter' ? 1 : 2;
    for (const field of ['progressMm', 'lateralMm', 'halfLengthMm', 'halfWidthMm'] as const) result[`catalog.o${i}.${field}`] = object[field];
  }
  return Object.freeze(result);
}

export class StreetRaceSession {
  readonly #execute: StreetGraphExecutor;
  readonly #ports: readonly string[];
  readonly #initial: Readonly<Record<string, number>>;
  readonly #bundle: StreetRaceBundle;
  readonly #roster: number;
  readonly #actions: number[][] = [];
  #values: Readonly<Record<string, number>>;

  constructor(bundle: StreetRaceBundle) {
    bundle = snapshotBundle(bundle);
    streetObjectRecord(bundle, ['version', 'domain', 'roster', 'track', 'objects', 'graph', 'initialInputs', 'initialOutputs', 'sources', 'qualification']);
    streetObjectRecord(bundle.qualification, ['proof', 'consensus', 'playability']);
    if (bundle.version !== 1 || bundle.domain !== 'sora-cars.street-race-draft.v1'
      || !Number.isInteger(bundle.roster) || bundle.roster < 2 || bundle.roster > 8
      || bundle.qualification.proof !== false || bundle.qualification.consensus !== false
      || bundle.qualification.playability !== false) throw new Error('Not a local draft street bundle.');
    const catalog = snapshotStreetObjectCatalog(bundle.track, { version: 1, trackId: bundle.track.id, objects: bundle.objects });
    this.#bundle = Object.freeze({ ...bundle, objects: catalog.objects });
    this.#roster = bundle.roster;
    this.#execute = createStreetGraphExecutor(bundle.graph, bundle.track);
    const catalogValues = catalogConstants(catalog.objects);
    const expectedOutputs = [...STREET_STATE_HEADER_FIELDS, 'rain', 'windMmPerTick', 'refundAllForfeit', 'technicalWin',
      ...Object.keys(catalogValues), ...Array.from({ length: this.roster }, (_, slot) =>
        [...STREET_CAR_FIELDS, ...FEEDBACK, 'slipMicroturn', 'gatesCrossed', 'justFinished'].map(name => `c${slot}.${name}`)).flat()];
    if (JSON.stringify(bundle.graph.outputs.map(port => port.name).sort()) !== JSON.stringify(expectedOutputs.sort())) {
      throw new Error('Street output/catalog layout mismatch.');
    }
    for (const port of bundle.graph.outputs) if (Object.hasOwn(catalogValues, port.name)) {
      const node = bundle.graph.nodes[port.node]!, expected = catalogValues[port.name]!;
      if (node.op !== 'constant' || node.value !== expected || node.low !== expected || node.high !== expected) {
        throw new Error(`Street native catalog metadata mismatch: ${port.name}`);
      }
    }
    const expected = [...STREET_STATE_HEADER_FIELDS, ...Array.from({ length: this.roster }, (_, slot) => [
      ...STREET_CAR_FIELDS.map(name => `c${slot}.${name}`), `c${slot}.controls`, `c${slot}.consensusForfeit`,
    ]).flat()];
    this.#ports = Object.freeze(bundle.graph.inputs.map(port => port.name));
    if (JSON.stringify(this.#ports) !== JSON.stringify(expected)) throw new Error('Street action/state layout mismatch.');
    // Native canonical genesis assertions execute before a session is admitted
    // to this lab. Metadata cannot silently substitute an alternate grid.
    const first = this.#execute(bundle.initialInputs);
    const initial = Object.fromEntries(expected.map((name, i) => [name, bundle.initialInputs[i]!])) as Record<string, number>;
    if (initial.tick !== 0 || initial.done !== 0 || initial.worldBrokenMask !== 0) throw new Error('Street genesis clock mismatch.');
    for (const name of expected.filter(n => n.endsWith('.controls') || n.endsWith('.consensusForfeit'))) {
      if (initial[name] !== 0) throw new Error('Street genesis actions must be zero.');
    }
    for (const name of expected.filter(n => n !== 'tick' && !n.endsWith('.controls') && !n.endsWith('.consensusForfeit'))) {
      if (first[name] !== initial[name]) throw new Error(`Street genesis must be stationary: ${name}`);
    }
    const nativeInitial = { ...first, tick: 0 };
    if (JSON.stringify(Object.entries(nativeInitial).sort()) !== JSON.stringify(Object.entries(bundle.initialOutputs).sort())) {
      throw new Error('Street native genesis metadata mismatch.');
    }
    this.#initial = Object.freeze(nativeInitial);
    this.#values = this.#initial;
    // Private state remains mutable; public metadata bindings cannot be
    // reassigned or shadowed by JavaScript callers after admission.
    Object.freeze(this);
  }

  get bundle(): StreetRaceBundle { return this.#bundle; }
  get roster(): number { return this.#roster; }
  get values(): Readonly<Record<string, number>> { return this.#values; }
  get actions(): readonly (readonly number[])[] { return this.#actions.map(row => Object.freeze([...row])); }
  reset(): void { this.#values = this.#initial; this.#actions.length = 0; }

  step(controls: readonly number[], consensusForfeits: readonly number[] = Array(this.roster).fill(0)): StreetRaceState {
    const capturedControls = streetObjectArray(controls, this.roster), capturedForfeits = streetObjectArray(consensusForfeits, this.roster);
    if (capturedControls.length !== this.roster || capturedForfeits.length !== this.roster
      || capturedControls.some(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 63)
      || capturedForfeits.some(n => n !== 0 && n !== 1)) throw new Error('Invalid street actions.');
    const actionRow = [...capturedControls, ...capturedForfeits].map(n => n === 0 ? 0 : n as number);
    const inputs = this.#ports.map(name => {
      if (name.endsWith('.controls')) return actionRow[Number(name.slice(1, name.indexOf('.')))]!;
      if (name.endsWith('.consensusForfeit')) return actionRow[this.roster + Number(name.slice(1, name.indexOf('.')))]!;
      const value = this.#values[name];
      if (value === undefined) throw new Error(`Missing street state ${name}`);
      return value;
    });
    const result = this.#execute(inputs); // Commit only after every node passes.
    const wasDone = this.#values.done === 1;
    if (!wasDone) this.#actions.push(actionRow);
    this.#values = result;
    return this.state;
  }

  get state(): StreetRaceState {
    const value = this.#values;
    return { tick: value.tick!, done: value.done === 1, worldBrokenMask: value.worldBrokenMask!, rain: value.rain!, windMmPerTick: value.windMmPerTick!,
      refundAllForfeit: value.refundAllForfeit === 1, technicalWin: value.technicalWin === 1,
      cars: Array.from({ length: this.roster }, (_, slot) => ({
        ...Object.fromEntries([...STREET_CAR_FIELDS, ...FEEDBACK].map(name => [name, value[`c${slot}.${name}`]!])), skin: slot % 6,
      }) as unknown as StreetCarState) };
  }
}
