import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertLoadedStreetRoute, loadStreetRoute, loadStreetRouteMusic, STREET_ROUTES } from '../src/game/street/assets';

test('packaged street admission rejects failures before caching and brands only frozen hash-checked assets', async () => {
  const descriptor = STREET_ROUTES[0]!, originalFetch = globalThis.fetch;
  const bundleBytes = new Uint8Array(readFileSync(new URL(`../public/${descriptor.bundlePath}`, import.meta.url)));
  let requests = 0, response: () => Response = () => new Response(null, { status: 503 });
  globalThis.fetch = async (input, options) => {
    requests++;
    assert.equal(new URL(String(input), 'https://asset.test/').pathname, `/${descriptor.bundlePath}`);
    assert.equal(options?.redirect, 'error');
    return response();
  };
  try {
    assert.throws(() => loadStreetRoute('../remote-graph'), /Unknown/);
    assert.equal(requests, 0);
    await assert.rejects(loadStreetRoute(descriptor.id), /unavailable/);
    response = () => new Response(bundleBytes.slice(0, -1));
    await assert.rejects(loadStreetRoute(descriptor.id), /truncated/);
    response = () => new Response(new Uint8Array(descriptor.bundleBytes + 1));
    await assert.rejects(loadStreetRoute(descriptor.id), /exceeds/);
    const changed = bundleBytes.slice(); changed[0] ^= 1;
    response = () => new Response(changed);
    await assert.rejects(loadStreetRoute(descriptor.id), /hash mismatch/);
    response = () => new Response(bundleBytes);
    const before = requests;
    const [first, second] = await Promise.all([loadStreetRoute(descriptor.id), loadStreetRoute(descriptor.id)]);
    assert.equal(requests, before + 1);
    assert.equal(first, second);
    assertLoadedStreetRoute(first);
    assert.ok(Object.isFrozen(first) && Object.isFrozen(first.descriptor));
    assert.ok(Object.isFrozen(first.bundle.graph.nodes) && Object.isFrozen(first.bundle.graph.nodes[0]));
    assert.equal(first.bundle.track.id, descriptor.id);
    assert.equal(first.bundle.roster, 8);
    assert.equal(first.bundle.track.maxTicks, 9000);
    assert.throws(() => assertLoadedStreetRoute({ descriptor: first.descriptor, bundle: first.bundle }), /admission/);
    assert.throws(() => { (first.bundle.graph.nodes[0] as { low: number }).low++; });
    assert.throws(() => { (first.descriptor as { bundleSha256: string }).bundleSha256 = '0'.repeat(64); });
    assert.equal(await loadStreetRoute(descriptor.id), first);
    assert.equal(requests, before + 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('street music retries bad bytes and serves the admitted Blob without an unchecked second fetch', async () => {
  const descriptor = STREET_ROUTES[0]!, originalFetch = globalThis.fetch;
  const bytes = new Uint8Array(readFileSync(new URL(`../public/${descriptor.musicPath}`, import.meta.url)));
  let requests = 0, corrupt = true;
  globalThis.fetch = async (input, options) => {
    requests++;
    assert.equal(new URL(String(input), 'https://asset.test/').pathname, `/${descriptor.musicPath}`);
    assert.equal(options?.redirect, 'error');
    const payload = bytes.slice(); if (corrupt) payload[0] ^= 1;
    return new Response(payload);
  };
  let objectURL: string | undefined;
  try {
    await assert.rejects(loadStreetRouteMusic(descriptor.id), /hash mismatch/);
    corrupt = false;
    const [one, two] = await Promise.all([loadStreetRouteMusic(descriptor.id), loadStreetRouteMusic(descriptor.id)]);
    objectURL = one;
    assert.equal(one, two); assert.match(one, /^blob:/); assert.equal(requests, 2);
    const served = new Uint8Array(await (await originalFetch(one)).arrayBuffer());
    assert.deepEqual(served, bytes);
    assert.equal(await loadStreetRouteMusic(descriptor.id), one); assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (objectURL) URL.revokeObjectURL(objectURL);
  }
});
