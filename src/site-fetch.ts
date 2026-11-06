// SoraFS gateways serve at most 8 MiB per site response. A larger file answers an unranged GET
// with 413 and `Accept-Ranges: bytes`, then serves single byte ranges of at most 8 MiB. A
// same-origin GET that meets that refusal is re-requested range by range and returned as one
// ordinary 200 response, so three.js loaders, hash-checked assets and downloads read the whole
// file unchanged. Every other response passes through untouched.
export const SITE_RANGE_BYTES = 8 * 1024 * 1024;
const SMALLEST_RANGE_BYTES = 256 * 1024;
const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;

type Fetch = typeof globalThis.fetch;
interface SitePart { bytes: Uint8Array<ArrayBuffer>; total: number; type: string | null }

const method = (input: RequestInfo | URL, init?: RequestInit) => (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

export function withSiteRanges(base: Fetch, origin: string): Fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (response.status !== 413 || response.headers.get('accept-ranges')?.toLowerCase() !== 'bytes' || method(input, init) !== 'GET') return response;
    // A GET has no body, so copying the request leaves the caller's untouched.
    const request = new Request(input, init);
    if (new URL(request.url).origin !== origin || request.headers.has('range')) return response;
    await response.body?.cancel();
    return rangedResponse(base, request);
  };
}

async function rangedResponse(base: Fetch, request: Request): Promise<Response> {
  let span = SITE_RANGE_BYTES;
  const part = async (start: number, total?: number): Promise<SitePart> => {
    for (;;) {
      const end = (total === undefined ? start + span : Math.min(start + span, total)) - 1, headers = new Headers(request.headers);
      headers.set('range', `bytes=${start}-${end}`);
      const response = await base(new Request(request, { headers }));
      // A gateway with a smaller limit refuses the range itself; halve it and ask again.
      if (response.status === 413 && span > SMALLEST_RANGE_BYTES) { await response.body?.cancel(); span = Math.max(SMALLEST_RANGE_BYTES, span / 2); continue; }
      const range = CONTENT_RANGE.exec(response.headers.get('content-range') ?? ''), size = Number(range?.[3]), last = Number(range?.[2]);
      if (response.status !== 206 || !range || Number(range[1]) !== start || !(size > start) || total !== undefined && size !== total || last !== Math.min(end, size - 1)) {
        await response.body?.cancel();
        throw new Error(`Site bytes ${start}-${end} of ${request.url} were not served as requested (${response.status}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== last - start + 1) throw new Error(`Site bytes ${start}-${last} of ${request.url} are truncated.`);
      return { bytes, total: size, type: response.headers.get('content-type') };
    }
  };
  const first = await part(0);
  let offset = first.bytes.byteLength;
  // No read-ahead: each range is requested when the reader asks, so at most one is held and an
  // abort stops the next request.
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) { controller.enqueue(first.bytes); if (offset === first.total) controller.close(); },
    async pull(controller) {
      const next = await part(offset, first.total);
      offset += next.bytes.byteLength; controller.enqueue(next.bytes);
      if (offset === first.total) controller.close();
    },
  }, { highWaterMark: 0 });
  const headers = new Headers({ 'content-length': String(first.total) });
  if (first.type) headers.set('content-type', first.type);
  return new Response(body, { status: 200, headers });
}

if (typeof window !== 'undefined' && typeof location !== 'undefined' && typeof globalThis.fetch === 'function') globalThis.fetch = withSiteRanges(globalThis.fetch.bind(globalThis), location.origin);
