import test from 'node:test';
import assert from 'node:assert/strict';
import { assetDownloadProgress, withAssetDownloads } from '../src/asset-downloads';

const origin = 'https://scene.example';
test('scene requests are bounded through body completion, with actual byte progress', async () => {
  let active = 0, peak = 0;
  const read = withAssetDownloads(async () => {
    active++; peak = Math.max(peak, active);
    return new Response(new ReadableStream({ start(controller) { setTimeout(() => { controller.enqueue(new Uint8Array(32)); active--; controller.close(); }, 10); } }), { headers: { 'content-length': '32' } });
  }, origin, { concurrency: 2 });
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => read(`${origin}/assets/queue-${i}.bin`)));
  assert.equal(peak, 2);
  for (const response of responses) assert.equal((await response.arrayBuffer()).byteLength, 32);
  const progress = assetDownloadProgress(); assert.ok(progress.loadedBytes >= 192); assert.ok(progress.completed >= 6); assert.equal(progress.active, 0);
});

test('a broken response body retries the complete asset without concatenating partial bytes', async () => {
  let attempts = 0;
  const read = withAssetDownloads(async () => {
    attempts++;
    if (attempts === 1) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([99])); controller.error(new TypeError('network connection lost')); } }));
    return new Response(new Uint8Array([1, 2, 3]));
  }, origin, { retryDelayMs: 0 });
  assert.deepEqual(new Uint8Array(await (await read(`${origin}/assets/retry.bin`)).arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(attempts, 2);
});

test('missing files fail once; transient failures are bounded and release queue slots', async () => {
  let calls = 0;
  const read = withAssetDownloads(async input => { calls++; return new Response(null, { status: String(input instanceof Request ? input.url : input).includes('missing') ? 404 : 503 }); }, origin, { concurrency: 1, retryDelayMs: 0 });
  await assert.rejects(read(`${origin}/assets/missing.bin`), /404/); assert.equal(calls, 1);
  await assert.rejects(read(`${origin}/assets/busy.bin`), /503/); assert.equal(calls, 4);
});

test('caller cancellation does not retry and a queued cancelled request never reaches the network', async () => {
  const failuresBefore = assetDownloadProgress().failed;
  let unblock!: () => void, calls = 0;
  const read = withAssetDownloads(async () => { calls++; await new Promise<void>(resolve => { unblock = resolve; }); return new Response('ok'); }, origin, { concurrency: 1 });
  const first = read(`${origin}/assets/hold.bin`);
  await new Promise(resolve => setTimeout(resolve, 0));
  const abort = new AbortController(), second = read(`${origin}/assets/abort.bin`, { signal: abort.signal });
  abort.abort(); unblock(); await first;
  await assert.rejects(second, (error: Error) => error.name === 'AbortError'); assert.equal(calls, 1);
  assert.equal(assetDownloadProgress().failed, failuresBefore, 'user cancellation must not poison later scene progress');
});

test('stalled bodies retry, while continuing chunks reset the inactivity timeout', async () => {
  let attempts = 0;
  const read = withAssetDownloads(async input => {
    const request = input as Request, stalled = ++attempts === 1;
    return new Response(new ReadableStream({ start(controller) {
      let timer: ReturnType<typeof setInterval> | undefined, chunks = 0;
      const abort = () => { clearInterval(timer); controller.error(request.signal.reason); };
      request.signal.addEventListener('abort', abort, { once: true });
      if (!stalled) timer = setInterval(() => {
        controller.enqueue(new Uint8Array([++chunks]));
        if (chunks === 6) { clearInterval(timer); request.signal.removeEventListener('abort', abort); controller.close(); }
      }, 20);
    } }), { headers: { 'content-length': '6' } });
  }, origin, { timeoutMs: 80, retryDelayMs: 0 });
  assert.deepEqual(new Uint8Array(await (await read(`${origin}/assets/stalled.bin`)).arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5, 6]));
  assert.equal(attempts, 2, 'the live second body runs longer than the timeout without restarting');
});

test('ledger requests, other origins and caller-selected byte ranges are untouched', async () => {
  const seen: [RequestInfo | URL, RequestInit | undefined][] = [], response = new Response('unchanged');
  const read = withAssetDownloads(async (input, init) => { seen.push([input, init]); return response; }, origin);
  for (const [url, init] of [[`${origin}/v1/query`, { method: 'POST', body: '{}' }], ['https://another.example/assets/a.bin', undefined], [`${origin}/assets/a.bin`, { headers: { range: 'bytes=0-9' } }]] as const) assert.equal(await read(url, init), response);
  assert.equal(seen.length, 3);
});

test('an explicit archive origin receives retries only for public asset paths', async () => {
  const archive = 'https://archive.scene.example';
  const calls = new Map<string, number>();
  const read = withAssetDownloads(async input => {
    const url = input instanceof Request ? input.url : String(input);
    calls.set(url, (calls.get(url) ?? 0) + 1);
    return new Response(null, { status: calls.get(url) === 1 ? 503 : 200 });
  }, origin, { trustedAssetOrigins: [archive], retryDelayMs: 0 });
  assert.equal((await read(`${archive}/assets/song.mp3`)).status, 200);
  assert.equal(calls.get(`${archive}/assets/song.mp3`), 2);
  assert.equal((await read(`${archive}/v1/query`)).status, 503);
  assert.equal((await read('https://unlisted.example/assets/song.mp3')).status, 503);
});

test('exact asset sizes include queued bytes and survive compressed response headers', async () => {
  const before = assetDownloadProgress();
  let releaseBody!: () => void;
  const read = withAssetDownloads(async () => new Response(new ReadableStream({ start(controller) {
    releaseBody = () => { controller.enqueue(new Uint8Array(100)); controller.close(); };
  } }), { headers: { 'content-encoding': 'gzip', 'content-length': '25' } }), origin, { concurrency: 1, knownBytes: () => 100 });
  const first = read(`${origin}/assets/compressed-size-1.bin`);
  const second = read(`${origin}/assets/compressed-size-2.bin`);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(assetDownloadProgress().totalBytes - before.totalBytes, 200, 'queued requests contribute exact expected bytes');
  releaseBody(); await first;
  await new Promise(resolve => setTimeout(resolve, 0));
  releaseBody(); await second;
  assert.equal(assetDownloadProgress().loadedBytes - before.loadedBytes, 200, 'decoded bytes, not compressed Content-Length, drive progress');
});
