import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_RANGE_BYTES, withSiteRanges } from '../src/site-fetch';

const ORIGIN = 'https://cid.sorafs.example';

// Mirrors the SoraFS site gateway: one file per response up to `limit`, otherwise 413 with
// Accept-Ranges, and single byte ranges of at most `limit` answered with 206 and Content-Range.
function gateway(files: Record<string, Uint8Array<ArrayBuffer>>, options: { limit?: number; tamper?: (start: number, end: number, size: number) => string } = {}) {
  const limit = options.limit ?? SITE_RANGE_BYTES, log: { path: string; method: string; range: string | null; probe: string | null }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), path = new URL(request.url).pathname, file = files[path], range = request.headers.get('range');
    if (request.signal.aborted) throw new DOMException('aborted', 'AbortError');
    log.push({ path, method: request.method, range, probe: request.headers.get('x-probe') });
    if (!file) return new Response(null, { status: 404 });
    const refuse = () => new Response('{"error":"request one bounded byte range"}', { status: 413, headers: { 'accept-ranges': 'bytes', 'content-type': 'application/json' } });
    if (!range) return file.byteLength > limit ? refuse() : new Response(file, { status: 200, headers: { 'content-type': 'font/ttf', 'accept-ranges': 'bytes' } });
    const [, from, to] = /^bytes=(\d+)-(\d*)$/.exec(range)!, start = Number(from), end = Math.min(to ? Number(to) : file.byteLength - 1, file.byteLength - 1);
    if (start >= file.byteLength || end < start) return new Response(null, { status: 416 });
    if (end - start + 1 > limit) return refuse();
    const contentRange = options.tamper?.(start, end, file.byteLength) ?? `bytes ${start}-${end}/${file.byteLength}`;
    return new Response(file.slice(start, end + 1), { status: 206, headers: { 'content-range': contentRange, 'content-type': 'application/octet-stream', 'accept-ranges': 'bytes' } });
  };
  return { fetch, log };
}

const bytes = (size: number) => { const out = new Uint8Array(size); for (let i = 0; i < size; i++) out[i] = (i * 2654435761 >>> 24) ^ i; return out; };

test('files within the gateway limit pass through as the gateway sent them', async () => {
  const small = bytes(1024), site = gateway({ '/a.bin': small }), seen: Response[] = [];
  const read = withSiteRanges(async (input, init) => { const response = await site.fetch(input, init); seen.push(response); return response; }, ORIGIN);
  const response = await read(`${ORIGIN}/a.bin`);
  assert.equal(response, seen[0]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), small);
});

test('a file above 8 MiB is read as bounded ranges and returned whole', async () => {
  const file = bytes(2 * SITE_RANGE_BYTES + 12_345), site = gateway({ '/models/tree.bin': file });
  const response = await withSiteRanges(site.fetch, ORIGIN)(new Request(`${ORIGIN}/models/tree.bin`, { headers: { 'x-probe': 'three' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(file.byteLength));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file);
  assert.deepEqual(site.log.map(entry => entry.range), [null, `bytes=0-${SITE_RANGE_BYTES - 1}`, `bytes=${SITE_RANGE_BYTES}-${2 * SITE_RANGE_BYTES - 1}`, `bytes=${2 * SITE_RANGE_BYTES}-${file.byteLength - 1}`]);
  assert.ok(site.log.every(entry => entry.probe === 'three' && entry.method === 'GET'));
});

test('a gateway with a smaller limit is read in halved ranges', async () => {
  const file = bytes(3 * 1024 * 1024 + 7), site = gateway({ '/hdr.hdr': file }, { limit: 1024 * 1024 });
  const response = await withSiteRanges(site.fetch, ORIGIN)(`${ORIGIN}/hdr.hdr`);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), file);
  assert.ok(site.log.filter(entry => entry.range).every(entry => { const [, a, b] = /bytes=(\d+)-(\d+)/.exec(entry.range!)!; return Number(b) - Number(a) + 1 <= SITE_RANGE_BYTES; }));
});

test('other origins, other methods and explicit ranges keep the refusal', async () => {
  const file = bytes(SITE_RANGE_BYTES + 1), site = gateway({ '/big.wav': file }), read = withSiteRanges(site.fetch, ORIGIN);
  assert.equal((await read('https://elsewhere.example/big.wav')).status, 413);
  assert.equal((await read(`${ORIGIN}/big.wav`, { method: 'HEAD' })).status, 413);
  assert.equal((await read(`${ORIGIN}/big.wav`, { headers: { range: 'bytes=0-' } })).status, 413);
  assert.equal(site.log.length, 3);
});

test('a range served for different bytes fails the read instead of joining them', async () => {
  const file = bytes(SITE_RANGE_BYTES + 100);
  const shifted = gateway({ '/x.glb': file }, { tamper: (start, end, size) => `bytes ${start + 1}-${end}/${size}` });
  await assert.rejects(withSiteRanges(shifted.fetch, ORIGIN)(`${ORIGIN}/x.glb`), /were not served as requested/);
  const resized = gateway({ '/x.glb': file }, { tamper: (start, end, size) => `bytes ${start}-${end}/${start ? size + 1 : size}` });
  const response = await withSiteRanges(resized.fetch, ORIGIN)(`${ORIGIN}/x.glb`);
  await assert.rejects(response.arrayBuffer(), /were not served as requested/);
});

test('aborting the caller stops the remaining ranges', async () => {
  const file = bytes(3 * SITE_RANGE_BYTES), site = gateway({ '/song.wav': file }), controller = new AbortController();
  const response = await withSiteRanges(site.fetch, ORIGIN)(`${ORIGIN}/song.wav`, { signal: controller.signal });
  const reader = response.body!.getReader();
  assert.equal((await reader.read()).value?.byteLength, SITE_RANGE_BYTES);
  controller.abort();
  await assert.rejects(reader.read(), (error: Error) => error.name === 'AbortError');
  assert.equal(site.log.filter(entry => entry.range).length, 1);
});
