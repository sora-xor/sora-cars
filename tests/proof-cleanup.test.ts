import test from 'node:test';
import assert from 'node:assert/strict';
import { completeOwnedCleanup } from '../src/ui/proof-cleanup';

test('one cleanup rejection cannot release a lock while another owned write is pending', async () => {
  let finish!: () => void, observed = false;
  const write = new Promise<void>(resolve => { finish = resolve; });
  const failure = new Error('first cleanup failed');
  const cleanup = completeOwnedCleanup([Promise.reject(failure), write]).finally(() => { observed = true; });
  const rejected = assert.rejects(cleanup, error => error instanceof AggregateError && error.cause === failure && error.errors[0] === failure);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(observed, false);
  finish(); await rejected; assert.equal(observed, true);
});

test('cleanup waits for every participant and preserves all failures in order', async () => {
  const first = new Error('file abort'), second = new Error('stage cleanup');
  await assert.rejects(completeOwnedCleanup([Promise.reject(first), undefined, Promise.reject(second)]), error => error instanceof AggregateError && error.errors[0] === first && error.errors[1] === second);
  await completeOwnedCleanup([undefined, Promise.resolve()]);
});
