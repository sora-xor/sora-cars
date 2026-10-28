import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { withOwnedResources, closeWebSocketServer } from './harness-lifecycle.mjs';

// These are synthetic returned handles, not Vite, Chromium, ws or native fixtures.
for (const failAt of ['create', 'listen', 'launch', 'mkdir', 'test']) {
  test(`partial ${failAt} failure closes every handle already returned`, async () => {
    const log = [], primary = new Error(failAt);
    await assert.rejects(withOwnedResources(async own => {
      if (failAt === 'create') throw primary;
      const server = own('server', {}, async () => { log.push('server close'); });
      assert.ok(server);
      if (failAt === 'listen') throw primary;
      log.push('listening');
      if (failAt === 'launch') throw primary;
      own('browser', {}, async () => { log.push('browser close'); });
      if (failAt === 'mkdir') throw primary;
      log.push('directory made');
      throw primary;
    }), error => error === primary);
    const closures = log.filter(event => event.endsWith('close'));
    assert.deepEqual(closures, failAt === 'create' ? [] : ['listen', 'launch'].includes(failAt) ? ['server close'] : ['browser close', 'server close']);
  });
}

test('awaits closes in reverse acquisition order before returning a result', async () => {
  const log = [];
  const result = await withOwnedResources(async own => {
    own('server', {}, async () => { await Promise.resolve(); log.push('server'); });
    own('browser', {}, async () => { await new Promise(resolve => setImmediate(resolve)); log.push('browser'); });
    return { passed: true };
  });
  log.push('report');
  assert.deepEqual(log, ['browser', 'server', 'report']);
  assert.deepEqual(result, { passed: true });
});

test('attempts all closes and preserves primary plus every sync/async cleanup failure', async () => {
  const log = [], primary = new Error('assertion'), browser = new Error('browser close'), sockets = new Error('socket close');
  await assert.rejects(withOwnedResources(async own => {
    own('server', {}, async () => { log.push('server'); });
    own('sockets', {}, () => { log.push('sockets'); throw sockets; });
    own('browser', {}, async () => { log.push('browser'); throw browser; });
    throw primary;
  }), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.cause, primary);
    assert.equal(error.errors[0], primary); assert.equal(error.errors[1].cause, browser); assert.equal(error.errors[2].cause, sockets);
    return true;
  });
  assert.deepEqual(log, ['browser', 'sockets', 'server']);
});

test('a cleanup-only failure cannot return a passing result', async () => {
  const failure = new Error('close'); let passed = false;
  await assert.rejects((async () => {
    await withOwnedResources(async own => { own('server', {}, () => { throw failure; }); return { passed: true }; });
    passed = true;
  })(), error => error instanceof AggregateError && error.errors[0].cause === failure);
  assert.equal(passed, false);
});

test('retains non-Error/undefined primary throws and rejects late ownership', async () => {
  let late;
  await assert.rejects(withOwnedResources(async own => { late = own; throw undefined; }), error => error === undefined);
  assert.throws(() => late('too late', {}, () => {}), /before cleanup/);
});

test('an old success report is removed and no new report is written on cleanup failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sora-harness-lifecycle-'));
  try {
    const file = join(directory, 'report.json'); await writeFile(file, '{"passed":true}');
    await rm(file, { force: true });
    await assert.rejects((async () => {
      const report = await withOwnedResources(async own => {
        own('server', {}, async () => { throw new Error('cleanup'); }); return { passed: true };
      });
      await writeFile(file, JSON.stringify(report));
    })(), /cleanup/);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function socketsFixture({ badClient = false, serverThrow = false, serverError = false, neverClose = false } = {}) {
  const log = [], clients = new Set(); let callback, serverClosing = false;
  const done = () => { if (serverClosing && !clients.size && !neverClose) setImmediate(() => { log.push('server closed'); callback?.(serverError ? new Error('server callback failed') : undefined); }); };
  for (const name of ['first', 'second']) {
    const client = new EventEmitter(); client.readyState = 1;
    client.terminate = () => {
      log.push(`${name} terminate`);
      if (badClient && name === 'first') throw new Error('first terminate failed');
      setImmediate(() => { client.readyState = 3; clients.delete(client); log.push(`${name} closed`); client.emit('close'); done(); });
    };
    clients.add(client);
  }
  const server = { clients, close(cb) {
    log.push('server closing'); callback = cb; serverClosing = true;
    if (serverThrow) throw new Error('server close threw');
    done();
  } };
  return { server, clients, log };
}

test('wallet waits for both client close events and the server close callback', async () => {
  const { server, log } = socketsFixture();
  await closeWebSocketServer(server, { timeoutMs: 1000 }); log.push('returned');
  assert.deepEqual(log, ['server closing','first terminate','second terminate','first closed','second closed','server closed','returned']);
});

test('one client termination failure does not skip another client or server close', async () => {
  const { server, clients, log } = socketsFixture({ badClient: true });
  await assert.rejects(closeWebSocketServer(server, { timeoutMs: 10 }), error => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.errors.some(e => /first terminate/.test(e.message)));
    assert.ok(error.errors.some(e => /server close timed out/.test(e.message)));
    return true;
  });
  assert.deepEqual(log, ['server closing','first terminate','second terminate','second closed']);
  for (const client of clients) { assert.equal(client.listenerCount('close'), 0); assert.equal(client.listenerCount('error'), 0); }
});

test('server callback failure still awaits every owned client', async () => {
  const { server, log } = socketsFixture({ serverError: true });
  await assert.rejects(closeWebSocketServer(server), error => error.errors.some(e => /server callback failed/.test(e.message)));
  assert.ok(log.includes('first closed')); assert.ok(log.includes('second closed'));
});

test('a synchronous server-close throw still terminates and waits all clients', async () => {
  const { server, log } = socketsFixture({ serverThrow: true });
  await assert.rejects(closeWebSocketServer(server), error => error.errors.some(e => /server close threw/.test(e.message)));
  assert.ok(log.includes('first closed')); assert.ok(log.includes('second closed'));
});

test('already closed client and empty server complete without a spurious terminate', async () => {
  const client = new EventEmitter(); client.readyState = 3; client.terminate = () => assert.fail('closed client');
  const server = { clients: new Set([client]), close: cb => cb() };
  await closeWebSocketServer(server);
  await closeWebSocketServer({ clients: new Set(), close: cb => cb() });
});

test('incomplete closure times out honestly and remaining resource closes still run', async () => {
  const { server } = socketsFixture({ neverClose: true }), log = [];
  await assert.rejects(withOwnedResources(async own => {
    own('Vite', {}, () => { log.push('vite close'); });
    own('wallet sockets', server, resource => closeWebSocketServer(resource, { timeoutMs: 10 }));
  }), error => error.errors[0].cause.errors.some(e => /timed out/.test(e.message)));
  assert.deepEqual(log, ['vite close']);
});
