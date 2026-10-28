/** Focused tests of actual harness helpers. Synthetic byte maps/file handles only: this is
 * not a browser/Torii/proof qualification and never executes the native runner.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./test-native-replay-browser.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function recordScenarioCleanup(');
const end = source.indexOf('async function fileHash(', start);
assert.ok(start > 0 && end > start, 'Actual pure evidence helper source is present');
const context = vm.createContext({ assert, Buffer, setTimeout, clearTimeout });
vm.runInContext(source.slice(start, end) + '\nglobalThis.subject = { closeScenarioResources, downloadedReplayFromOpfs };', context);
const { closeScenarioResources, downloadedReplayFromOpfs } = context.subject;
const path = 'sora-cars-replay-01234567-89ab-cdef-0123-456789abcdef/replay.nrt';
const expected = Buffer.from(Array.from({ length: 64 }, (_, index) => index));
const files = () => ({ [path]: expected.toString('base64') });
const snapshotStart = source.indexOf('async function readOpfsSnapshot(');
const snapshotEnd = source.indexOf('async function opfsFiles(', snapshotStart);
assert.ok(snapshotStart > 0 && snapshotEnd > snapshotStart);
function snapshotReader(root) {
  const runtime = vm.createContext({ DOMException, setTimeout,
    navigator: { storage: { getDirectory: root } }, btoa: value => Buffer.from(value, 'binary').toString('base64') });
  vm.runInContext(source.slice(snapshotStart, snapshotEnd) + '\nglobalThis.read = readOpfsSnapshot;', runtime);
  return runtime.read;
}
const fileHandle = text => ({ kind: 'file', getFile: async () => ({ size: Buffer.byteLength(text),
  arrayBuffer: async () => Uint8Array.from(Buffer.from(text)).buffer }) });

test('retains bytes from the supplied observed file map without borrowing expected bytes', () => {
  const observed = downloadedReplayFromOpfs(files(), '64', expected);
  assert.equal(observed.path, path);
  assert.deepEqual(observed.bytes, expected);
  assert.notEqual(observed.bytes, expected);
  observed.bytes[0] = 255;
  assert.equal(expected[0], 0);
});
test('rejects absent or competing OPFS replay files', () => {
  assert.throws(() => downloadedReplayFromOpfs({}, '64', expected), /Exactly one/);
  assert.throws(() => downloadedReplayFromOpfs({ ...files(), [path.replace('01234567', '11234567')]: expected.toString('base64') }, '64', expected), /Exactly one/);
});
test('rejects observed bytes changed independently of the original producer', () => {
  const changed = Buffer.from(expected); changed[17] ^= 1;
  assert.throws(() => downloadedReplayFromOpfs({ [path]: changed.toString('base64') }, '64', expected), /differs from the original/);
});
test('requires canonical declared length and actual OPFS length equality', () => {
  for (const value of ['064', '0', '131073', undefined]) {
    assert.throws(() => downloadedReplayFromOpfs(files(), value, expected));
  }
  assert.throws(() => downloadedReplayFromOpfs(files(), '65', expected), /original producer replay/);
  assert.throws(() => downloadedReplayFromOpfs({ [path]: expected.subarray(1).toString('base64') }, '64', expected), /Content-Length/);
});
test('rejects an unexpected path or oversized observation before decoding', () => {
  assert.throws(() => downloadedReplayFromOpfs({ 'sora-cars-replay-other/replay.nrt': expected.toString('base64') }, '64', expected), /staging path/);
  assert.throws(() => downloadedReplayFromOpfs({ [path]: 'a'.repeat(Math.ceil(131072 / 3) * 4 + 1) }, '64', expected), /observation exceeds/);
});
test('settles pending metadata before closing the owned context', async () => {
  const events = [], result = {};
  const pending = [new Promise(resolve => setTimeout(() => { events.push('metadata'); resolve(); }, 15))];
  await closeScenarioResources(result, async () => { events.push('snapshot'); }, async () => { events.push('close'); }, pending);
  assert.deepEqual(events, ['snapshot', 'metadata', 'close']);
  assert.equal(result.cleanup_errors, undefined);
});
test('bounded metadata timeout still closes and drains the owned context', { timeout: 4000 }, async () => {
  let settle, closed = false;
  const pending = [new Promise(resolve => { settle = resolve; })], result = {};
  await closeScenarioResources(result, async () => {}, async () => { closed = true; settle(); }, pending);
  assert.equal(closed, true);
  assert.equal(result.cleanup_errors.length, 1);
  assert.equal(result.cleanup_errors[0].stage, 'network-observations-before-close');
  assert.match(result.cleanup_errors[0].error, /exceeded 2 seconds/);
});
test('failed diagnostics and context closure preserve the original proof failure', async () => {
  const primary = new Error('original native proof failure'), result = {};
  await assert.rejects(async () => {
    try { throw primary; }
    finally {
      await closeScenarioResources(result,
        async () => { throw new Error('snapshot unavailable'); },
        async () => { throw new Error('context closure failed'); }, []);
    }
  }, error => error === primary);
  assert.equal(result.cleanup_errors.length, 2);
  assert.equal(result.cleanup_errors[0].stage, 'final-diagnostics');
  assert.equal(result.cleanup_errors[1].stage, 'browser-context');
});
test('a disappearing descendant retries the whole snapshot and discards partial entries', async () => {
  let scans = 0;
  const root = { async *entries() {
    scans++;
    if (scans === 1) {
      yield ['partial.nrt', fileHandle('old')];
      yield ['deleted', { kind: 'directory', async *entries() { throw new DOMException('deleted during cleanup', 'NotFoundError'); } }];
    } else yield ['retained.nrt', fileHandle('proof')];
  } };
  const result = await snapshotReader(async () => root)(1024);
  assert.deepEqual(Object.keys(result), ['retained.nrt']);
  assert.equal(result['retained.nrt'], Buffer.from('proof').toString('base64'));
  assert.equal(scans, 2);
});
test('a file disappearing in getFile can be followed by a genuinely empty snapshot', async () => {
  let scans = 0;
  const root = { async *entries() {
    if (++scans === 1) yield ['deleted.nrt', { kind: 'file', getFile: async () => { throw new DOMException('gone', 'NotFoundError'); } }];
  } };
  assert.deepEqual(Object.keys(await snapshotReader(async () => root)(1024)), []);
  assert.equal(scans, 2);
});
test('persistent deletion/inaccessible traversal fails after eight attempts rather than reporting empty', async () => {
  const missing = new DOMException('still inaccessible', 'NotFoundError'); let scans = 0;
  const read = snapshotReader(async () => ({ async *entries() { scans++; throw missing; } }));
  await assert.rejects(read(1024), error => error === missing);
  assert.equal(scans, 8);
});
test('root access and non-deletion storage errors remain fatal without retries', async () => {
  const rootError = new DOMException('root unavailable', 'NotFoundError'); let roots = 0;
  await assert.rejects(snapshotReader(async () => { roots++; throw rootError; })(1024), error => error === rootError);
  assert.equal(roots, 1);
  for (const error of [new DOMException('permission denied', 'NotAllowedError'), new Error('I/O failure')]) {
    let scans = 0;
    await assert.rejects(snapshotReader(async () => ({ async *entries() { scans++; throw error; } }))(1024), reason => reason === error);
    assert.equal(scans, 1);
  }
});
