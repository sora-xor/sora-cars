/** Shared, bounded transport for public scene assets. Ledger/API requests never enter this queue. */
export interface AssetDownloadProgress {
  loadedBytes: number; totalBytes: number; completed: number; total: number;
  active: number; failed: number; retrying: boolean;
}
interface Download { loaded: number; total: number; state: 'queued' | 'active' | 'done' | 'failed'; retrying: boolean }
const downloads = new Map<string, Download>();

/** Totals describe discovered requests, not an invented full-scene estimate. */
export function assetDownloadProgress(): AssetDownloadProgress {
  const result: AssetDownloadProgress = { loadedBytes: 0, totalBytes: 0, completed: 0, total: downloads.size, active: 0, failed: 0, retrying: false };
  for (const item of downloads.values()) {
    result.loadedBytes += item.loaded; result.totalBytes += Math.max(item.total, item.loaded);
    result.completed += Number(item.state === 'done'); result.active += Number(item.state === 'active' || item.state === 'queued');
    result.failed += Number(item.state === 'failed'); result.retrying ||= item.retrying;
  }
  return result;
}

class AssetHttpError extends Error { constructor(readonly status: number, url: string) { super(`Asset download failed (${status}): ${url}`); } }
const transient = (error: unknown) => !(error instanceof AssetHttpError) || [408, 429, 500, 502, 503, 504].includes(error.status);
export interface AssetDownloadOptions { concurrency?: number; attempts?: number; timeoutMs?: number; retryDelayMs?: number; trustedAssetOrigins?: readonly string[]; knownBytes?: (url: URL) => number | undefined }

export function withAssetDownloads(base: typeof fetch, origin: string, options: AssetDownloadOptions = {}): typeof fetch {
  const concurrency = options.concurrency ?? 4, attempts = options.attempts ?? 3;
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = () => new Promise<void>(resolve => {
    const start = () => { active++; resolve(); };
    if (active < concurrency) start(); else queue.push(start);
  });
  const release = () => { active--; queue.shift()?.(); };
  return async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    const publicAsset = url.pathname.startsWith('/assets/');
    const trustedOrigin = url.origin === origin || publicAsset && options.trustedAssetOrigins?.includes(url.origin);
    if (!trustedOrigin || request.method !== 'GET' || !url.pathname.includes('/assets/') || request.headers.has('range')) return base(input, init);
    const hint = options.knownBytes?.(url);
    const expected = Number.isSafeInteger(hint) && hint! > 0 ? hint! : 0;
    const item: Download = { loaded: 0, total: expected, state: 'queued', retrying: false };
    downloads.set(request.url, item);
    await acquire();
    try {
      for (let attempt = 0; attempt < attempts; attempt++) {
        request.signal.throwIfAborted();
        item.state = 'active'; item.loaded = 0; item.retrying = attempt > 0;
        const controller = new AbortController();
        const abort = () => controller.abort(request.signal.reason);
        request.signal.addEventListener('abort', abort, { once: true });
        let timer: ReturnType<typeof setTimeout>;
        // An inactivity timeout, reset for each body chunk; slow but progressing downloads survive.
        const touch = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new DOMException('Asset download stalled', 'TimeoutError')), options.timeoutMs ?? 30000); };
        touch();
        try {
          const response = await base(new Request(request, { signal: controller.signal }));
          if (!response.ok) { await response.body?.cancel(); throw new AssetHttpError(response.status, request.url); }
          const size = Number(response.headers.get('content-length'));
          item.total = expected || (!response.headers.has('content-encoding') && Number.isSafeInteger(size) && size > 0 ? size : 0);
          const reader = response.body?.getReader(), parts: Uint8Array<ArrayBuffer>[] = [];
          if (reader) try {
            for (;;) {
              const next = await reader.read(); if (next.done) break;
              parts.push(next.value); item.loaded += next.value.byteLength; touch();
            }
          } catch (error) { await reader.cancel().catch(() => {}); throw error; }
          // Fetch decodes HTTP content-encoding; only identity bodies use wire Content-Length.
          if ((expected || !response.headers.has('content-encoding')) && item.total && item.loaded !== item.total) throw new Error(`Truncated asset: ${request.url}`);
          item.total = item.loaded; item.state = 'done'; item.retrying = false;
          const headers = new Headers(response.headers); headers.delete('content-encoding'); headers.delete('content-length'); headers.set('content-length', String(item.loaded));
          return new Response(new Blob(parts, { type: headers.get('content-type') ?? '' }), { status: response.status, statusText: response.statusText, headers });
        } catch (error) {
          if (request.signal.aborted || attempt + 1 === attempts || !transient(error)) throw error;
        } finally { clearTimeout(timer!); request.signal.removeEventListener('abort', abort); }
        await new Promise(resolve => setTimeout(resolve, (options.retryDelayMs ?? 400) * (attempt + 1)));
      }
      throw new Error(`Asset download exhausted: ${request.url}`);
    } catch (error) {
      // A user cancelling a music download is not a scene failure. Do not erase a
      // newer request for the same URL if that request replaced this entry.
      if (request.signal.aborted && downloads.get(request.url) === item) downloads.delete(request.url);
      else { item.state = 'failed'; item.retrying = false; }
      throw error;
    }
    finally { release(); }
  };
}
