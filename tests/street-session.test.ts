import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetGraphExecutor, STREET_GRAPH_DOMAIN, type StreetGraphNode, type StreetGraphPort } from '../src/game/street/graph';
import { StreetRaceSession, STREET_CAR_FIELDS, type StreetRaceBundle } from '../src/game/street/session';

/** Small synthetic host-session fixture, not a native race/physics relation.
 * Its controls visibly change speed so replay/atomicity tests detect different
 * values being consumed by simulation and history without generated artifacts.
 */
function bundle(): StreetRaceBundle {
  const nodes: StreetGraphNode[] = [], inputs: StreetGraphPort[] = [], outputs: StreetGraphPort[] = [];
  const initialInputs: number[] = [];
  const input = (name: string, value: number, low: number, high: number) => {
    const node = nodes.length;
    nodes.push({ op: 'input', input: inputs.length, low, high });
    inputs.push({ name, node }); initialInputs.push(value);
    return node;
  };
  const constant = (value: number) => { const node = nodes.length; nodes.push({ op: 'constant', value, low: value, high: value }); return node; };
  const emit = (name: string, node: number) => outputs.push({ name, node });
  const tick = input('tick', 0, 0, 9000), done = input('done', 0, 0, 1), mask = input('worldBrokenMask', 0, 0, 1);
  const fields: number[][] = [], controls: number[] = [];
  for (const slot of [0, 1]) {
    const initial = [-1, slot ? 950 : -950, 0, 0, 0, 1000, 0, 0, 0, 0, 1];
    fields.push(STREET_CAR_FIELDS.map((name, i) => input(`c${slot}.${name}`, initial[i]!, -12000, 1000000)));
    controls.push(input(`c${slot}.controls`, 0, 0, 63));
    input(`c${slot}.consensusForfeit`, 0, 0, 1);
  }
  const zero = constant(0), one = constant(1), acceleration = constant(28), nextTick = nodes.length;
  nodes.push({ op: 'add', a: tick, b: one, low: 1, high: 9001 });
  emit('tick', nextTick); emit('done', done); emit('worldBrokenMask', mask);
  for (const name of ['rain', 'windMmPerTick', 'refundAllForfeit', 'technicalWin']) emit(name, zero);
  for (const slot of [0, 1]) {
    const speed = nodes.length; nodes.push({ op: 'multiply', a: controls[slot]!, b: acceleration, low: 0, high: 1764 });
    const progress = nodes.length; nodes.push({ op: 'add', a: fields[slot]![0]!, b: speed, low: -12000, high: 1001764 });
    for (const [i, name] of STREET_CAR_FIELDS.entries()) emit(`c${slot}.${name}`, i === 0 ? progress : i === 2 ? speed : fields[slot]![i]!);
    for (const name of ['rank', 'boosting', 'drifting', 'wallContact', 'carContact', 'oil', 'oilCrossed', 'propHitMask', 'slipMicroturn', 'gatesCrossed', 'justFinished']) emit(`c${slot}.${name}`, zero);
  }
  const object = { id: 'fixture-sign', kind: 'breakaway_sign' as const, progressMm: 100000, lateralMm: 0, halfLengthMm: 500, halfWidthMm: 500 };
  emit('catalog.count', one); emit('catalog.o0.kind', constant(2));
  for (const name of ['progressMm', 'lateralMm', 'halfLengthMm', 'halfWidthMm'] as const) emit(`catalog.o0.${name}`, constant(object[name]));
  const result: StreetRaceBundle = {
    version: 1, domain: 'sora-cars.street-race-draft.v1', roster: 2,
    track: {
      version: 1, topology: 'sprint', id: 'session-fixture', name: { ja: '入力試験', en: 'Session fixture' }, year: 1986,
      originE7: [0, 0], lengthMm: 500000, laps: 1, maxTicks: 9000, targetMs: 1000,
      samples: Array.from({ length: 101 }, (_, i) => ({ progressMm: i * 5000, eastMm: i * 5000, northMm: 0,
        elevationMm: 0, halfWidthMm: 5000, headingMicroturn: 250000, turnPerMetre: 0, sector: 0 })),
      gates: [{ id: 'start', sample: 0 }, { id: 'finish', sample: 100 }],
      sound: { asset: 'fixture.mid', sha256: '0'.repeat(64), durationMs: 1000, cuesMs: [0, 500] },
      qualification: { historicalAlignment: false, nativeParity: false, proof: false },
    },
    objects: [object], graph: { version: 1, domain: STREET_GRAPH_DOMAIN, geometryLookup: 'unqualified', nodes, inputs, outputs },
    initialInputs, initialOutputs: {}, sources: { fixture: '0'.repeat(64) },
    qualification: { proof: false, consensus: false, playability: false },
  };
  result.initialOutputs = { ...createStreetGraphExecutor(result.graph, result.track)(initialInputs), tick: 0 };
  return result;
}

test('session detaches and freezes all public metadata as well as simulation inputs', () => {
  const raw = bundle(), session = new StreetRaceSession(raw), before = structuredClone(session.bundle);
  raw.track.samples[0]!.halfWidthMm = 2500;
  (raw.graph.inputs[0] as { name: string }).name = 'not-tick';
  (raw.sources as Record<string, string>).fixture = 'changed';
  (raw.objects[0] as { progressMm: number }).progressMm += 5000;
  assert.deepEqual(session.bundle, before);
  const allFrozen = (value: unknown): boolean => !value || typeof value !== 'object'
    || Object.isFrozen(value) && Object.values(value).every(allFrozen);
  assert.ok(allFrozen(session.bundle));
  assert.throws(() => Object.assign(session, { bundle: raw }), TypeError);
  assert.throws(() => Object.assign(session, { roster: 1 }), TypeError);
  assert.throws(() => Object.defineProperty(session, 'bundle', { value: raw }), TypeError);
  assert.throws(() => Object.defineProperty(session, 'roster', { value: 1 }), TypeError);
  assert.equal(session.step([1, 0]).cars[0]!.speedMmPerTick, 28);
});

test('one captured action row drives both simulation and exact replay', () => {
  const session = new StreetRaceSession(bundle()), controls = [1, 0], forfeits = [0, 0];
  session.step(controls, forfeits); controls[0] = 0; forfeits[0] = 1;
  session.step([0, 1]);
  assert.deepEqual(session.actions, [[1, 0, 0, 0], [0, 1, 0, 0]]);
  const replay = new StreetRaceSession(bundle());
  for (const row of session.actions) replay.step(row.slice(0, 2), row.slice(2));
  assert.deepEqual(replay.values, session.values);
  assert.throws(() => (session.actions[0] as number[])[0] = 63, TypeError);
});

test('action accessors, iterators and malformed arrays reject before state or history changes', () => {
  let calls = 0;
  const invalid = (modify: (controls: any) => any, forfeit = false) => {
    const session = new StreetRaceSession(bundle()), initial = session.values;
    const values = modify([1, 0]);
    assert.throws(() => forfeit ? session.step([1, 0], values) : session.step(values));
    assert.equal(session.values, initial); assert.equal(session.state.tick, 0); assert.equal(session.actions.length, 0);
  };
  invalid(v => { Object.defineProperty(v, '0', { enumerable: true, get() { calls++; return 1; } }); return v; });
  invalid(v => { v[Symbol.iterator] = function* () { calls++; throw new Error('iterator executed'); }; return v; });
  invalid(v => { v.some = () => { calls++; return false; }; return v; });
  invalid(v => { Object.setPrototypeOf(v, class extends Array {}.prototype); return v; });
  invalid(v => { delete v[1]; return v; });
  invalid(() => new Array(2));
  invalid(() => [64, 0]);
  invalid(() => [1, 0.5]);
  invalid(() => [1]);
  invalid(v => { Object.defineProperty(v, '0', { enumerable: true, get() { calls++; return 0; } }); return v; }, true);
  invalid(() => [0, 2], true);
  assert.equal(calls, 0);
});

test('bundle snapshots reject accessors, cycles, foreign prototypes and excessive depth before reads', () => {
  let calls = 0;
  const invalid = (modify: (draft: any) => void) => { const raw = bundle(); modify(raw); assert.throws(() => new StreetRaceSession(raw)); };
  invalid(v => { Object.defineProperty(v, 'roster', { enumerable: true, get() { calls++; return 2; } }); });
  invalid(v => { Object.defineProperty(v.track.samples[0], 'halfWidthMm', { enumerable: true, get() { calls++; return 5000; } }); });
  invalid(v => { v.graph.nodes.map = () => { calls++; return []; }; });
  invalid(v => { delete v.track.samples[1]; });
  invalid(v => { v.sources.self = v; });
  invalid(v => { Object.setPrototypeOf(v, { inherited: 1 }); });
  invalid(v => { v.sources[Symbol('identity')] = 'changed'; });
  invalid(v => { Object.defineProperty(v.sources, 'hidden', { value: 'changed' }); });
  invalid(v => { let row = v.sources; for (let i = 0; i < 20; i++) row = row.child = {}; });
  invalid(v => { v.sources.large = 'a'.repeat(8193); });
  invalid(v => { v.unexpected = true; });
  assert.equal(calls, 0);
});

test('native catalog descriptor constants must match all visible physical object metadata', () => {
  const invalid = (modify: (draft: any) => void) => { const raw = bundle(); modify(raw); assert.throws(() => new StreetRaceSession(raw), /catalog/); };
  invalid(v => { v.objects = []; });
  invalid(v => { v.objects[0].progressMm += 5000; });
  invalid(v => { v.objects[0].lateralMm = 1000; });
  invalid(v => { v.objects[0].halfLengthMm = 750; });
  invalid(v => { v.objects[0].halfWidthMm = 750; });
  invalid(v => { v.objects[0].kind = 'tree_planter'; });
  invalid(v => { v.graph.outputs = v.graph.outputs.filter((p: { name: string }) => p.name !== 'catalog.count'); });
  invalid(v => { v.graph.outputs.push({ name: 'catalog.o1.kind', node: v.graph.outputs.at(-1).node }); });
  invalid(v => {
    const port = v.graph.outputs.find((p: { name: string }) => p.name === 'catalog.o0.lateralMm');
    port.node = v.graph.inputs.find((p: { name: string }) => p.name === 'worldBrokenMask').node;
  });
  const artOnly = bundle(); (artOnly.objects[0] as { id: string }).id = 'another-art-id';
  assert.equal(new StreetRaceSession(artOnly).bundle.objects[0]!.id, 'another-art-id');
});

test('missing native state or feedback outputs reject at admission', () => {
  for (const name of ['worldBrokenMask', 'c0.oil', 'c0.propHitMask', 'c0.finishDenominator']) {
    const raw = bundle();
    raw.graph = { ...raw.graph, outputs: raw.graph.outputs.filter(port => port.name !== name) };
    assert.throws(() => new StreetRaceSession(raw), /output\/catalog layout/);
  }
});
