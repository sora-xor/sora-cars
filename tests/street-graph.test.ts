import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetGraphExecutor, STREET_GRAPH_DOMAIN, type StreetGraph, type StreetGraphNode } from '../src/game/street/graph';
import type { CompiledStreetTrack } from '../src/game/street/track';

/** Structurally valid straight sprint; not a historically authored route. */
function track(): CompiledStreetTrack {
  return {
    version: 1, topology: 'sprint', id: 'graph-fixture', name: { ja: '演算試験', en: 'Arithmetic fixture' }, year: 1986,
    originE7: [0, 0], lengthMm: 500_000, laps: 1, maxTicks: 9000, targetMs: 1000,
    samples: Array.from({ length: 101 }, (_, i) => ({ progressMm: i * 5_000, eastMm: i * 5_000, northMm: 0,
      elevationMm: 0, halfWidthMm: 5_000, headingMicroturn: 250_000, turnPerMetre: 0, sector: 0 })),
    gates: [{ id: 'start', sample: 0 }, { id: 'finish', sample: 100 }],
    sound: { asset: 'fixture.mid', sha256: '0'.repeat(64), durationMs: 1000, cuesMs: [0, 500] },
    qualification: { historicalAlignment: false, nativeParity: false, proof: false },
  };
}

function graph(nodes: readonly StreetGraphNode[], inputNames: readonly string[], outputNodes: readonly number[]): StreetGraph {
  const inputs = nodes.flatMap((node, i) => node.op === 'input' ? [{ name: inputNames[node.input]!, node: i }] : [])
    .sort((a, b) => (nodes[a.node] as Extract<StreetGraphNode, { op: 'input' }>).input - (nodes[b.node] as Extract<StreetGraphNode, { op: 'input' }>).input);
  return { version: 1, domain: STREET_GRAPH_DOMAIN, geometryLookup: 'unqualified', nodes, inputs,
    outputs: outputNodes.map(node => ({ name: `value${node}`, node })) };
}

const arithmetic = (): StreetGraph => graph([
  { op: 'input', input: 0, low: -100, high: 100 },
  { op: 'input', input: 1, low: 1, high: 10 },
  { op: 'input', input: 2, low: 0, high: 1 },
  { op: 'constant', value: 7, low: 7, high: 7 },
  { op: 'add', a: 0, b: 3, low: -93, high: 107 },
  { op: 'subtract', a: 0, b: 3, low: -107, high: 93 },
  { op: 'multiply', a: 0, b: 1, low: -1000, high: 1000 },
  { op: 'divide', a: 0, b: 1, low: -100, high: 100 },
  { op: 'less', a: 0, b: 3, low: 0, high: 1 },
  { op: 'equal', a: 0, b: 3, low: 0, high: 1 },
  { op: 'remainder', a: 3, divisor: 4, low: 0, high: 3 },
  { op: 'select', condition: 2, yes: 6, no: 7, low: -1000, high: 1000 },
], ['速度', 'divisor', 'boost'], [4, 5, 6, 7, 8, 9, 10, 11]);

test('native graph primitives preserve declared input order and signed integer semantics', () => {
  const execute = createStreetGraphExecutor(arithmetic(), track());
  assert.deepEqual(execute([-23, 5, 1]), { value4: -16, value5: -30, value6: -115, value7: -4, value8: 1, value9: 0, value10: 3, value11: -115 });
  assert.deepEqual(execute([7, 2, 0]), { value4: 14, value5: 0, value6: 14, value7: 3, value8: 0, value9: 1, value10: 3, value11: 3 });
  assert.equal(execute([-1, 10, 0]).value7, 0);
  assert.equal(Object.is(execute([-1, 10, 0]).value7, -0), false);
  assert.ok(Object.isFrozen(execute([1, 1, 0])));
});

test('correlated select can assert tighter bounds than its operand union', () => {
  const clamp = graph([
    { op: 'input', input: 0, low: -100, high: 100 },
    { op: 'constant', value: 0, low: 0, high: 0 },
    { op: 'less', a: 0, b: 1, low: 0, high: 1 },
    { op: 'select', condition: 2, yes: 1, no: 0, low: 0, high: 100 },
  ], ['input'], [3]);
  const execute = createStreetGraphExecutor(clamp, track());
  assert.equal(execute([-70]).value3, 0);
  assert.equal(execute([70]).value3, 70);
});

test('every unused and unselected node is bounded and failure leaves the executor reusable', () => {
  const bounded = graph([
    { op: 'input', input: 0, low: 0, high: 100 },
    { op: 'constant', value: 2, low: 2, high: 2 },
    { op: 'constant', value: 0, low: 0, high: 0 },
    { op: 'multiply', a: 0, b: 1, low: 0, high: 10 },
    { op: 'select', condition: 2, yes: 3, no: 0, low: 0, high: 100 },
  ], ['input'], [4]);
  const execute = createStreetGraphExecutor(bounded, track());
  assert.equal(execute([5]).value4, 5);
  assert.throws(() => execute([6]), /node 3/);
  assert.equal(execute([4]).value4, 4);
  const unused = { ...bounded, outputs: [{ name: 'input', node: 0 }] };
  assert.throws(() => createStreetGraphExecutor(unused, track())([6]), /node 3/);
});

test('safe arithmetic rejects overflow before later cancellation could hide it', () => {
  const large = 2 ** 49;
  const overflow = graph([
    { op: 'input', input: 0, low: 0, high: large },
    { op: 'constant', value: 2, low: 2, high: 2 },
    { op: 'multiply', a: 0, b: 1, low: 0, high: 2 ** 50 - 1 },
    { op: 'subtract', a: 2, b: 2, low: 0, high: 0 },
  ], ['value'], [3]);
  const execute = createStreetGraphExecutor(overflow, track());
  assert.throws(() => execute([large]), /node 2/);
  assert.equal(execute([large - 1]).value3, 0);
  const exact = graph([
    { op: 'input', input: 0, low: -(2 ** 50) + 1, high: 2 ** 50 - 1 },
    { op: 'constant', value: 3, low: 3, high: 3 },
    { op: 'divide', a: 0, b: 1, low: -(2 ** 50) + 1, high: 2 ** 50 - 1 },
  ], ['value'], [2]);
  for (const value of [2 ** 50 - 1, -(2 ** 50) + 1, 0]) {
    assert.equal(createStreetGraphExecutor(exact, track())([value]).value2, Number(BigInt(value) / 3n));
  }
});

test('all geometry fields share frozen interval and sprint endpoint semantics', () => {
  const road = track();
  road.samples[1]!.headingMicroturn = 249_000;
  road.samples[2]!.headingMicroturn = 248_000;
  const g = graph([
    { op: 'input', input: 0, low: -100_000_000, high: 100_000_000 },
    { op: 'geometry', field: 'heading', progress: 0, low: -210_000_000, high: 210_000_000 },
    { op: 'geometry', field: 'half_width', progress: 0, low: 2500, high: 12000 },
    { op: 'geometry', field: 'interval_turn', progress: 0, low: -499999, high: 499999 },
    { op: 'geometry', field: 'interval_span', progress: 0, low: 4900, high: 5000 },
  ], ['progress'], [1, 2, 3, 4]);
  const execute = createStreetGraphExecutor(g, road);
  assert.deepEqual(execute([2500]), { value1: 249500, value2: 5000, value3: -1000, value4: 5000 });
  assert.deepEqual(execute([-100]), { value1: 250000, value2: 5000, value3: -1000, value4: 5000 });
  assert.deepEqual(execute([500_001]), { value1: 250000, value2: 5000, value3: 0, value4: 5000 });
  road.samples[1]!.headingMicroturn = 200_000;
  assert.equal(execute([2500]).value1, 249500, 'caller mutation cannot alter captured geometry');
});

test('closed schema rejects foreign fields, forward references and ambiguous input maps', () => {
  const mutate = (change: (v: any) => void) => { const v = structuredClone(arithmetic()); change(v); assert.throws(() => createStreetGraphExecutor(v, track())); };
  mutate(v => v.version = 2);
  mutate(v => v.geometryLookup = 'qualified');
  mutate(v => v.domain = 'privacy-proof');
  mutate(v => v.trusted = true);
  mutate(v => delete v.outputs);
  mutate(v => v.nodes[4].b = 4);
  mutate(v => v.nodes[4].a = -1);
  mutate(v => v.nodes[4].a = 0.5);
  mutate(v => v.nodes[4].future = 0);
  mutate(v => v.nodes[4].op = 'race');
  mutate(v => v.nodes[0].low = -(2 ** 50));
  mutate(v => v.nodes[0].high = 2 ** 50);
  mutate(v => v.nodes[0].high = NaN);
  mutate(v => v.nodes[0].low = 101);
  mutate(v => v.nodes[3].high = 8);
  mutate(v => v.nodes[3].value = 7.5);
  mutate(v => v.inputs[0].node = 1);
  mutate(v => v.inputs[1].name = v.inputs[0].name);
  mutate(v => v.nodes.push({ op: 'input', input: 0, low: -100, high: 100 }));
  mutate(v => v.outputs[0].node = v.nodes.length);
  mutate(v => v.outputs[1].name = v.outputs[0].name);
  mutate(v => v.nodes = new Array(v.nodes.length));
  mutate(v => Object.defineProperty(v.nodes[0], 'input', { get: () => 0, enumerable: true }));
  mutate(v => Object.defineProperty(v, 'secret', { value: true, enumerable: false }));
  mutate(v => v.nodes[Symbol('ignored')] = 0);
});

test('declared prerequisite ranges reject non-Boolean selects and invalid division or remainder', () => {
  const mutate = (change: (v: any) => void) => { const v = structuredClone(arithmetic()); change(v); assert.throws(() => createStreetGraphExecutor(v, track())); };
  mutate(v => v.nodes[1].low = 0);
  mutate(v => v.nodes[2].high = 2);
  mutate(v => v.nodes[2].low = -1);
  mutate(v => v.nodes[10].a = 0);
  mutate(v => v.nodes[10].divisor = 0);
  mutate(v => v.nodes[10].divisor = -4);
  mutate(v => v.nodes[10].divisor = 2 ** 50);
});

test('geometry rejects invalid progress claims, alternate field bounds and malformed tables', () => {
  const make = (): StreetGraph => graph([
    { op: 'input', input: 0, low: -100_000_000, high: 100_000_000 },
    { op: 'geometry', field: 'heading', progress: 0, low: -210_000_000, high: 210_000_000 },
  ], ['position'], [1]);
  const mutateGraph = (change: (v: any) => void) => { const v = structuredClone(make()); change(v); assert.throws(() => createStreetGraphExecutor(v, track())); };
  mutateGraph(v => v.nodes[0].high++);
  mutateGraph(v => v.nodes[1].field = 'sector');
  mutateGraph(v => v.nodes[1].high--);
  const mutateTrack = (change: (v: any) => void) => { const v = track(); change(v); assert.throws(() => createStreetGraphExecutor(make(), v)); };
  mutateTrack(v => v.topology = 'unknown');
  mutateTrack(v => v.samples.pop());
  mutateTrack(v => v.samples[10].progressMm++);
  mutateTrack(v => v.samples[10].eastMm = 15_000_001);
  mutateTrack(v => v.samples[10].halfWidthMm = 2499);
  mutateTrack(v => v.samples[10].headingMicroturn = 750000);
  mutateTrack(v => v.samples[10].headingMicroturn = 330000);
  mutateTrack(v => v.samples[100].headingMicroturn++);
  mutateTrack(v => v.samples[100].turnPerMetre = 1);
  mutateTrack(v => { v.samples[100].eastMm = 0; v.samples[100].northMm = 0; });
  mutateTrack(v => v.samples[10].sector = 32);
  mutateTrack(v => v.samples[10].eastMm = v.samples[9].eastMm);
});

test('malformed execution inputs reject atomically and cannot change captured graph definitions', () => {
  const source = arithmetic(), execute = createStreetGraphExecutor(source, track());
  for (const values of [[NaN, 1, 0], [1.5, 1, 0], [1, 0, 0], [1, 1, 2], [101, 1, 0], [1, 1], [1, 1, 0, 0]]) assert.throws(() => execute(values));
  const sparse = [1, 1, 0]; delete sparse[1]; assert.throws(() => execute(sparse));
  const values = [5, 2, 1]; Object.freeze(values);
  assert.equal(execute(values).value11, 10);
  (source.nodes[6] as { high: number }).high = 0;
  assert.equal(execute(values).value11, 10);
  assert.deepEqual(values, [5, 2, 1]);
});

test('port names preserve Unicode, quoting and prototype-like keys with byte-length limits', () => {
  const value = graph([{ op: 'constant', value: 7, low: 7, high: 7 }], [], [0]);
  for (const outputName of ['__proto__', 'constructor', 'quote"\\', '空'.repeat(32), '🚗'.repeat(24)]) {
    const named = { ...value, outputs: [{ name: outputName, node: 0 }] };
    const result = createStreetGraphExecutor(named, track())([]);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.hasOwn(result, outputName), true);
    assert.equal(result[outputName], 7);
  }
  for (const outputName of ['', '空'.repeat(33), '🚗'.repeat(25), '\ud800', '\udc00', '\u0000', '\u007f', 'a\nb']) {
    assert.throws(() => createStreetGraphExecutor({ ...value, outputs: [{ name: outputName, node: 0 }] }, track()));
  }
  assert.deepEqual(createStreetGraphExecutor(graph([], [], []), track())([]), {});
});


test('all 3434 signed scalar combinations agree with an independent BigInt oracle', () => {
  const scalar = graph([
    { op: 'input', input: 0, low: -50, high: 50 },
    { op: 'input', input: 1, low: 1, high: 17 },
    { op: 'input', input: 2, low: 0, high: 1 },
    { op: 'constant', value: 50, low: 50, high: 50 },
    { op: 'add', a: 0, b: 1, low: -49, high: 67 },
    { op: 'subtract', a: 0, b: 1, low: -67, high: 49 },
    { op: 'multiply', a: 0, b: 1, low: -850, high: 850 },
    { op: 'divide', a: 0, b: 1, low: -50, high: 50 },
    { op: 'add', a: 0, b: 3, low: 0, high: 100 },
    { op: 'remainder', a: 8, divisor: 17, low: 0, high: 16 },
    { op: 'less', a: 0, b: 1, low: 0, high: 1 },
    { op: 'equal', a: 0, b: 1, low: 0, high: 1 },
    { op: 'select', condition: 2, yes: 6, no: 7, low: -850, high: 850 },
  ], ['a', 'b', 'flag'], Array.from({ length: 13 }, (_, i) => i));
  const execute = createStreetGraphExecutor(scalar, track());
  let cases = 0;
  for (let a = -50; a <= 50; a++) for (let b = 1; b <= 17; b++) for (const flag of [0, 1]) {
    const x = BigInt(a), y = BigInt(b), quotient = x / y, product = x * y;
    const expected = [x, y, BigInt(flag), 50n, x + y, x - y, product, quotient,
      x + 50n, (x + 50n) % 17n, x < y ? 1n : 0n, x === y ? 1n : 0n,
      flag ? product : quotient].map(Number);
    // Every node is exposed for the parity test, including both select arms.
    assert.deepEqual(Object.values(execute([a, b, flag])), expected);
    cases++;
  }
  assert.equal(cases, 3434);
});
