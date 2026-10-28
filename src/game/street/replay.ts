import { assertLoadedStreetRoute, STREET_ROUTES, type LoadedStreetRoute } from './assets';
import { createStreetGraphExecutor, type StreetGraphExecutor } from './graph';
import { streetObjectArray, streetObjectRecord } from './objects';
import { STREET_CAR_FIELDS, StreetRaceSession, type StreetCarState, type StreetRaceBundle, type StreetRaceState } from './session';

export const STREET_REPLAY_TYPE = 'sora-cars-street-replay';
export const STREET_REPLAY_DOMAIN = 'sora-cars.local-street-practice.v1';
export const MAX_STREET_REPLAY_BYTES = 512_000;
const MAX_TICKS = 9_000;
const CHECKPOINT_TICKS = 30;
const FIELDS = ['type', 'version', 'domain', 'routeId', 'computationHash', 'roster', 'playerSlot', 'names', 'skins', 'savedAt', 'controls', 'outcome'] as const;

/** Local practice evidence only. No graph, custody authority, or forfeits are imported. */
export interface StreetReplay {
  readonly type: typeof STREET_REPLAY_TYPE;
  readonly version: 1;
  readonly domain: typeof STREET_REPLAY_DOMAIN;
  readonly routeId: string;
  readonly computationHash: string;
  readonly roster: number;
  readonly playerSlot: number;
  readonly names: readonly string[];
  readonly skins: readonly number[];
  readonly savedAt: string;
  readonly controls: readonly (readonly number[])[];
  readonly outcome: Readonly<Record<string, number>>;
}
export interface StreetReplayMetadata {
  readonly playerSlot: number;
  readonly names: readonly string[];
  readonly skins: readonly number[];
  readonly savedAt: string;
}
export interface VerifiedStreetReplay {
  readonly replay: StreetReplay;
  readonly descriptor: LoadedStreetRoute['descriptor'];
  readonly bundle: StreetRaceBundle;
  readonly length: number;
  readonly verification: 'local-reexecution';
}
export interface StreetReplayVerificationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (completedTicks: number, totalTicks: number) => void;
}
interface PlaybackData {
  readonly execute: StreetGraphExecutor;
  readonly ports: readonly string[];
  readonly checkpoints: ReadonlyMap<number, Readonly<Record<string, number>>>;
}
// A structurally similar object cannot stand in for a completed verification.
const verifiedData = new WeakMap<VerifiedStreetReplay, PlaybackData>();

function fail(message: string): never { throw new RangeError(`Street replay: ${message}`); }
function integer(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail(`invalid ${label}.`);
  return value;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 96 || [...value].length > 64
    || /[\u0000-\u001f\u007f]/u.test(value)) fail('invalid driver name.');
  // JSON allows lone UTF-16 surrogates. They are not canonical display names.
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) fail('invalid driver name.');
  }
  return value;
}
function captureReplay(raw: unknown): StreetReplay {
  const value = streetObjectRecord(raw, FIELDS);
  if (value.type !== STREET_REPLAY_TYPE || value.version !== 1 || value.domain !== STREET_REPLAY_DOMAIN) fail('unsupported replay format.');
  const descriptor = STREET_ROUTES.find(route => route.id === value.routeId);
  if (!descriptor || value.computationHash !== descriptor.bundleSha256) fail('unknown route or compiled computation.');
  const roster = integer(value.roster, 2, 8, 'roster');
  const playerSlot = integer(value.playerSlot, 0, roster - 1, 'player slot');
  const names = streetObjectArray(value.names, roster), skins = streetObjectArray(value.skins, roster);
  if (names.length !== roster || skins.length !== roster) fail('metadata must cover the complete roster.');
  if (typeof value.savedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.savedAt)
    || !Number.isFinite(Date.parse(value.savedAt)) || new Date(value.savedAt).toISOString() !== value.savedAt) fail('invalid saved date.');
  const controls = streetObjectArray(value.controls, MAX_TICKS);
  if (controls.length === 0) fail('a completed replay needs controls.');
  const rows = controls.map(row => {
    const values = streetObjectArray(row, roster);
    if (values.length !== roster) fail('control rows must contain controls only, with no forfeits.');
    return Object.freeze(values.map(control => integer(control, 0, 63, 'six-bit control')));
  });
  if (!value.outcome || typeof value.outcome !== 'object' || Array.isArray(value.outcome)) fail('invalid full outcome.');
  const keys = Reflect.ownKeys(value.outcome);
  if (keys.length < 7 || keys.length > 512 || keys.some(key => typeof key !== 'string' || !/^[A-Za-z0-9_.-]{1,96}$/.test(key))) fail('invalid outcome fields.');
  const outputNames = (keys as string[]).sort(), output = streetObjectRecord(value.outcome, outputNames);
  const outcome: Record<string, number> = {};
  for (const key of outputNames) Object.defineProperty(outcome, key, {
    value: integer(output[key], -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, `outcome ${key}`), enumerable: true,
  });
  if (outcome.done !== 1 || outcome.tick !== rows.length) fail('outcome must end at the last recorded tick.');
  return Object.freeze({
    type: STREET_REPLAY_TYPE, version: 1, domain: STREET_REPLAY_DOMAIN,
    routeId: descriptor.id, computationHash: descriptor.bundleSha256, roster, playerSlot,
    names: Object.freeze(names.map(name)), skins: Object.freeze(skins.map(skin => integer(skin, 0, 5, 'cosmetic skin'))),
    savedAt: value.savedAt, controls: Object.freeze(rows), outcome: Object.freeze(outcome),
  });
}

/** Canonical compact serialization, with sorted full-outcome keys. */
export function encodeStreetReplay(replay: StreetReplay): string {
  const result = JSON.stringify(captureReplay(replay));
  if (new TextEncoder().encode(result).length > MAX_STREET_REPLAY_BYTES) fail('file exceeds the replay byte limit.');
  return result;
}

/** Reject ambiguous duplicate keys, alternate number spellings and hidden fields.
 * Download with encodeStreetReplay; whitespace or key-order changes are not the
 * first-release wire format. JSON text cannot provide accessors or prototypes.
 */
export function decodeStreetReplay(text: string): StreetReplay {
  if (typeof text !== 'string' || text.length > MAX_STREET_REPLAY_BYTES
    || new TextEncoder().encode(text).length > MAX_STREET_REPLAY_BYTES) fail('file exceeds the replay byte limit.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('invalid JSON.'); }
  const replay = captureReplay(raw);
  if (JSON.stringify(replay) !== text) fail('JSON is not the canonical replay encoding.');
  return replay;
}

// Both arguments are snapshots admitted by native-session/asset constructors.
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(key => Object.hasOwn(b, key)
    && sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Export is still unverified data. Import and playback require reexecution. */
export function exportStreetReplay(session: StreetRaceSession, loaded: LoadedStreetRoute, metadata: StreetReplayMetadata): StreetReplay {
  assertLoadedStreetRoute(loaded);
  if (!(session instanceof StreetRaceSession) || !sameData(session.bundle, loaded.bundle)) fail('session is not the pinned route computation.');
  const actions = session.actions;
  if (!session.state.done || actions.length > MAX_TICKS || actions.length > loaded.bundle.track.maxTicks) fail('only a completed bounded practice session can be exported.');
  const controls = actions.map(row => {
    if (row.length !== session.roster * 2 || row.slice(session.roster).some(forfeit => forfeit !== 0)) fail('local practice cannot contain consensus forfeits.');
    return row.slice(0, session.roster);
  });
  const info = streetObjectRecord(metadata, ['playerSlot', 'names', 'skins', 'savedAt']);
  return captureReplay({ type: STREET_REPLAY_TYPE, version: 1, domain: STREET_REPLAY_DOMAIN,
    routeId: loaded.descriptor.id, computationHash: loaded.descriptor.bundleSha256,
    roster: session.roster, playerSlot: info.playerSlot, names: info.names, skins: info.skins, savedAt: info.savedAt,
    controls, outcome: session.values });
}

function advance(execute: StreetGraphExecutor, ports: readonly string[], values: Readonly<Record<string, number>>, controls: readonly number[]): Readonly<Record<string, number>> {
  return execute(ports.map(port => {
    if (port.endsWith('.consensusForfeit')) return 0;
    if (port.endsWith('.controls')) return controls[Number(port.slice(1, port.indexOf('.')))]!;
    const value = values[port];
    if (value === undefined) fail(`missing retained state ${port}.`);
    return value;
  }));
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Street replay verification cancelled.', 'AbortError');
}
function yieldToUI(): Promise<void> { return new Promise(resolve => setTimeout(resolve, 0)); }

/** Complete local reexecution. This does not verify a ledger proof, signatures,
 * human participation, finality, or any entitlement to XOR/NFTs.
 */
export async function verifyStreetReplay(raw: StreetReplay, loaded: LoadedStreetRoute, options: StreetReplayVerificationOptions = {}): Promise<VerifiedStreetReplay> {
  assertLoadedStreetRoute(loaded);
  aborted(options.signal);
  const replay = captureReplay(raw), { descriptor, bundle } = loaded;
  if (replay.routeId !== descriptor.id || replay.computationHash !== descriptor.bundleSha256
    || replay.roster !== bundle.roster || replay.controls.length > bundle.track.maxTicks) fail('route, roster, or duration does not match the admitted computation.');
  const expectedKeys = Object.keys(bundle.initialOutputs).sort(), claimedKeys = Object.keys(replay.outcome);
  if (expectedKeys.length !== claimedKeys.length || expectedKeys.some((key, index) => key !== claimedKeys[index])) fail('full outcome field layout does not match the admitted computation.');
  options.onProgress?.(0, replay.controls.length);
  await yieldToUI();
  aborted(options.signal);
  const execute = createStreetGraphExecutor(bundle.graph, bundle.track), ports = Object.freeze(bundle.graph.inputs.map(port => port.name));
  let values = bundle.initialOutputs, lastYield = performance.now();
  const checkpoints = new Map<number, Readonly<Record<string, number>>>([[0, values]]);
  for (let tick = 0; tick < replay.controls.length; tick++) {
    aborted(options.signal);
    if (values.done !== 0) fail('extra controls after a terminal frame.');
    values = advance(execute, ports, values, replay.controls[tick]!);
    if (values.tick !== tick + 1) fail('nonconsecutive simulation tick.');
    if ((tick + 1) % CHECKPOINT_TICKS === 0 || tick + 1 === replay.controls.length) checkpoints.set(tick + 1, values);
    if ((tick + 1) % CHECKPOINT_TICKS === 0 || performance.now() - lastYield >= 12) {
      options.onProgress?.(tick + 1, replay.controls.length);
      await yieldToUI();
      aborted(options.signal);
      lastYield = performance.now();
    }
  }
  const keys = Object.keys(values).sort();
  if (values.done !== 1 || keys.length !== claimedKeys.length || keys.some((key, index) => key !== claimedKeys[index] || values[key] !== replay.outcome[key])) fail('full outcome differs from the recorded controls.');
  options.onProgress?.(replay.controls.length, replay.controls.length);
  aborted(options.signal);
  const result: VerifiedStreetReplay = Object.freeze({ replay, descriptor, bundle, length: replay.controls.length, verification: 'local-reexecution' });
  verifiedData.set(result, { execute, ports, checkpoints });
  return result;
}

const FEEDBACK = ['rank', 'boosting', 'drifting', 'wallContact', 'carContact', 'oil', 'oilCrossed', 'propHitMask'] as const;
function state(values: Readonly<Record<string, number>>, replay: StreetReplay): StreetRaceState {
  return { tick: values.tick!, done: values.done === 1, worldBrokenMask: values.worldBrokenMask!, rain: values.rain!, windMmPerTick: values.windMmPerTick!,
    refundAllForfeit: values.refundAllForfeit === 1, technicalWin: values.technicalWin === 1,
    cars: Array.from({ length: replay.roster }, (_, slot) => ({
      ...Object.fromEntries([...STREET_CAR_FIELDS, ...FEEDBACK].map(field => [field, values[`c${slot}.${field}`]!])), skin: replay.skins[slot]!,
    }) as unknown as StreetCarState) };
}

/** Checkpoints are private, generated only during successful full verification.
 * Imported JSON has no checkpoint/state-restoration field. Seeking retains all
 * outputs, including broken masks, yaw, eligibility and fractional finish data.
 */
export class StreetReplayPlayback {
  readonly #verified: VerifiedStreetReplay;
  readonly #data: PlaybackData;
  #values: Readonly<Record<string, number>>;
  constructor(verified: VerifiedStreetReplay) {
    const data = verifiedData.get(verified);
    if (!data) fail('playback requires a genuine completed verification.');
    this.#verified = verified; this.#data = data; this.#values = data.checkpoints.get(0)!;
    Object.freeze(this);
  }
  get replay(): StreetReplay { return this.#verified.replay; }
  get values(): Readonly<Record<string, number>> { return this.#values; }
  get state(): StreetRaceState { return state(this.#values, this.replay); }
  get tick(): number { return this.#values.tick!; }
  get length(): number { return this.#verified.length; }
  get done(): boolean { return this.tick === this.length; }
  seek(tick: number): StreetRaceState {
    integer(tick, 0, this.length, 'seek tick');
    const checkpoint = this.#data.checkpoints.has(tick) ? tick : Math.floor(tick / CHECKPOINT_TICKS) * CHECKPOINT_TICKS;
    let values = this.#data.checkpoints.get(checkpoint)!;
    for (let at = checkpoint; at < tick; at++) values = advance(this.#data.execute, this.#data.ports, values, this.replay.controls[at]!);
    this.#values = values;
    return this.state;
  }
  step(): StreetRaceState {
    if (!this.done) this.#values = advance(this.#data.execute, this.#data.ports, this.#values, this.replay.controls[this.tick]!);
    return this.state;
  }
}
