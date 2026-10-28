import assert from 'node:assert/strict';
import test from 'node:test';
import { field, foldingExample, interpolateTrace, inverse, toyChallenge, toyTrace, traceCommitment, traceResiduals } from '../src/game/proof-workshop';

test('teaching trace distinguishes modular arithmetic, valid transitions and a two-sided tamper', () => {
  const rows = toyTrace();
  assert.deepEqual(rows.map(row => row.position), [0, 2, 5, 8, 12, 16, 4, 9]);
  assert.ok(traceResiduals(rows).flat().every(n => n === 0));
  assert.deepEqual(traceResiduals(toyTrace(true)).map(row => row[1]), [0, 0, 0, 3, 14, 0, 0]);
  assert.equal(field(16 + 1), 0);
  assert.equal(field(3 * inverse(2)), 10);
  assert.throws(() => inverse(0));
});
test('finite-field interpolation recovers every claimed row without legitimizing altered physics', () => {
  for (const rows of [toyTrace(), toyTrace(true)]) {
    rows.forEach(row => assert.equal(interpolateTrace(rows, row.tick), row.position));
    const values = Array.from({ length: 17 }, (_, x) => interpolateTrace(rows, x));
    // A degree-at-most-seven polynomial has zero eighth forward differences.
    let differences = values;
    for (let order = 0; order < 8; order++) differences = differences.slice(1).map((v, i) => field(v - differences[i]!));
    assert.ok(differences.every(n => n === 0));
  }
  assert.ok(traceResiduals(toyTrace(true)).flat().some(n => n !== 0));
});
test('Merkle roots bind row contents and order; demonstration challenges bind root and round', () => {
  const rows = toyTrace(), root = traceCommitment(rows).root;
  assert.match(root, /^[0-9a-f]{64}$/);
  assert.deepEqual(traceCommitment(rows).levels.map(level => level.length), [8, 4, 2, 1]);
  assert.notEqual(root, traceCommitment(toyTrace(true)).root);
  assert.notEqual(root, traceCommitment([...rows].reverse()).root);
  assert.notEqual(toyChallenge(root, 0).digest, toyChallenge(root, 1).digest);
  assert.notEqual(toyChallenge(root, 0).digest, toyChallenge(traceCommitment(toyTrace(true)).root, 0).digest);
});
test('FRI illustration uses opposite domain pairs and agrees with independent coefficient folding', () => {
  for (let beta = 0; beta < 17; beta++) {
    const [first, second, constant] = foldingExample(beta);
    assert.deepEqual([first!.values.length, second!.values.length, constant!.values.length], [16, 8, 4]);
    assert.equal(new Set(first!.domain).size, 16);
    for (let i = 0; i < 8; i++) assert.equal(field(first!.domain[i]! + first!.domain[i + 8]!), 0);
    second!.domain.forEach((x, i) => assert.equal(second!.values[i], field(3 + 2 * beta + (4 + beta) * x)));
    assert.ok(constant!.values.every(n => n === field(3 + 2 * beta + 7 * (4 + beta))));
  }
  assert.deepEqual(foldingExample(5)[2]!.values, [8, 8, 8, 8]);
});
