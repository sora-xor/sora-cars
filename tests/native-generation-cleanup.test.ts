import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupNativeResources, type NativeCleanupReport } from '../scripts/lib/native-artifact-generation.mjs';

// Faults are injected at the same owned-action boundary used for prepared files, lock cleanup and
// native stdout/stderr descriptors. These tests do not simulate native proofs or claim OS failures.
test('native cleanup attempts every prepared file and both lock actions while retaining the original failure', async () => {
  const calls: string[] = [], original = new Error('installation failed before cleanup');
  const unlinkFailure = new Error('temporary file unlink denied'), closeFailure = new Error('lock close failed');
  const report: NativeCleanupReport = {};
  const actions = [
    { resource: 'first temporary', run: async () => { calls.push('first temporary'); throw unlinkFailure; } },
    { resource: 'second temporary', run: async () => { calls.push('second temporary'); } },
    { resource: 'lock descriptor', run: async () => { calls.push('lock descriptor'); throw closeFailure; } },
    { resource: 'lock file', run: async () => { calls.push('lock file'); } },
  ];
  await assert.rejects(cleanupNativeResources(actions, original, report, 'installation'), error => {
    assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [original, unlinkFailure, closeFailure]);
    assert.equal(error.cause, original); assert.match(error.message, /installation failed before cleanup/); return true;
  });
  assert.deepEqual(calls, ['first temporary', 'second temporary', 'lock descriptor', 'lock file']);
  assert.deepEqual(report.primaryError, { name: 'Error', message: original.message });
  assert.deepEqual(report.cleanupErrors?.map(error => [error.context, error.resource, error.message]), [
    ['installation', 'first temporary', unlinkFailure.message], ['installation', 'lock descriptor', closeFailure.message],
  ]);
});

test('native cleanup closes stderr after stdout fails and records cleanup failure on an otherwise successful command', async () => {
  const calls: string[] = [], failure = new Error('stdout close failed'), report: NativeCleanupReport = {};
  await assert.rejects(cleanupNativeResources([
    { resource: 'stdout', run: () => { calls.push('stdout'); throw failure; } },
    { resource: 'stderr', run: async () => { calls.push('stderr'); } },
  ], undefined, report, 'native export'), error => {
    assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [failure]); assert.equal(error.cause, undefined); return true;
  });
  assert.deepEqual(calls, ['stdout', 'stderr']); assert.equal(report.primaryError, undefined);
  assert.deepEqual(report.cleanupErrors, [{ context: 'native export', resource: 'stdout', name: 'Error', message: failure.message }]);
});

test('native cleanup preserves a pending original exception unchanged when every cleanup succeeds', async () => {
  const original = new Error('parity command failed'), calls: string[] = [], report: NativeCleanupReport = {};
  await assert.rejects((async () => {
    let primaryError;
    try { throw original; }
    catch (error) { primaryError = error; throw error; }
    finally {
      await cleanupNativeResources([
        { resource: 'stdout', run: () => { calls.push('stdout'); } },
        { resource: 'stderr', run: async () => { calls.push('stderr'); } },
      ], primaryError, report, 'native export');
    }
  })(), error => error === original);
  assert.deepEqual(calls, ['stdout', 'stderr']); assert.deepEqual(report, {});
});

test('native cleanup retains nested installation and rollback errors together with multiple cleanup errors', async () => {
  const original = new Error('source drift'), rollback = new Error('replacement changed by another writer');
  const preceding = new AggregateError([original, rollback], 'installation and rollback failed');
  const failures = [new Error('first unlink failed'), new Error('second unlink failed')], report: NativeCleanupReport = {};
  await assert.rejects(cleanupNativeResources(failures.map((error, i) => ({ resource: `temporary ${i}`, run: async () => { throw error; } })), preceding, report, 'installation'), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.errors[0], preceding); assert.deepEqual(error.errors.slice(1), failures); return true;
  });
  assert.deepEqual(report.primaryError, { name: 'AggregateError', message: preceding.message, errors: [
    { name: 'Error', message: original.message }, { name: 'Error', message: rollback.message },
  ] });
  assert.equal(report.cleanupErrors?.length, 2);
});
