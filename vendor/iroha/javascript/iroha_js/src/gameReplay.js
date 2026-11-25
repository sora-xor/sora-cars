import {
  noritoDecodeGameReplayEvidenceV1, noritoEncodeGameReplayEvidenceV1,
  noritoDecodeGameReplayExportRequestV1, noritoEncodeGameReplayExportRequestV1,
} from "./norito.js";

export const GAME_REPLAY_MAX_EVIDENCE_BYTES_V1 = 16 * 1024 * 1024;
export const GAME_REPLAY_MAX_EXPORT_REQUEST_BYTES_V1 = GAME_REPLAY_MAX_EVIDENCE_BYTES_V1 + 8192;
export const GAME_REPLAY_MAX_DOWNLOAD_BYTES_V1 = 256 * 1024 * 1024;
export const encodeGameReplayEvidenceV1 = noritoEncodeGameReplayEvidenceV1;
export const decodeGameReplayEvidenceV1 = noritoDecodeGameReplayEvidenceV1;
export const encodeGameReplayExportRequestV1 = noritoEncodeGameReplayExportRequestV1;
export const decodeGameReplayExportRequestV1 = noritoDecodeGameReplayExportRequestV1;
const CHUNK_BYTES = 64 * 1024;

function positive(value, maximum, context) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RangeError(`${context} must be 1..${maximum}`);
  return value;
}
function originOf(value) {
  if (typeof value !== "string") throw new TypeError("Torii origin must be explicit");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || ![url.origin, `${url.origin}/`].includes(value)) throw new TypeError("Torii endpoint must be a canonical HTTP(S) origin without credentials or paths");
  return url.origin;
}
function freeze(value) {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function cancel(body) { try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Preserve transport failure. */ } }
function context(signal, milliseconds) {
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  if (signal) {
    if (!(signal instanceof AbortSignal)) throw new TypeError("signal must be an AbortSignal");
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("Torii replay transfer deadline exceeded")), milliseconds);
  return { signal: controller.signal, abort: reason => controller.abort(reason), close() { clearTimeout(timer); signal?.removeEventListener("abort", stop); } };
}
function check(signal) { if (signal.aborted) throw signal.reason ?? new Error("Torii replay transfer aborted"); }
function until(promise, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new Error("Torii replay transfer aborted"));
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
export class GameReplayHttpError extends Error {
  constructor(httpStatus) { super(`Torii game replay HTTP ${httpStatus}`); this.name = "GameReplayHttpError"; this.status = httpStatus; }
}

/** Fetch retained ledger artifacts plus explicitly supplied public input evidence.
 * No endpoint result grants independent verification, accepted-input or settlement authority.
 * The sink must discard partial output on rejection and publish only after this resolves.
 */
export function createFinalizedGameReplayClientV1(options) {
  if (!options || typeof options !== "object") throw new TypeError("Torii replay options required");
  const origin = originOf(options.origin), url = `${origin}/v1/games/replay`;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation required");
  const timeout = positive(options.transferTimeoutMs ?? 600_000, 600_000, "replay transfer timeout");
  return Object.freeze({
    origin,
    async downloadReplay(exportRequestBytes, write, callOptions = {}) {
      if (typeof write !== "function") throw new TypeError("a bounded replay write sink is required");
      const maximum = positive(callOptions.maxReplayBytes ?? GAME_REPLAY_MAX_DOWNLOAD_BYTES_V1, GAME_REPLAY_MAX_DOWNLOAD_BYTES_V1, "replay download limit");
      // Decode/copy before the first await. Later caller mutations cannot change uploaded pins/evidence.
      const decoded = decodeGameReplayExportRequestV1(exportRequestBytes);
      const archive = encodeGameReplayExportRequestV1(decoded), request = freeze(decoded.request);
      const task = context(callOptions.signal, timeout);
      let response, reader, done = false, total = 0;
      try {
        check(task.signal);
        const pending = Promise.resolve(fetchImpl(url, {
          method: "POST", body: new Blob([archive], { type: "application/octet-stream" }), signal: task.signal,
          credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "application/octet-stream", Accept: "application/octet-stream" },
        }));
        // A nonconforming fetch implementation may resolve after abort. Release its body too.
        void pending.then(late => { if (task.signal.aborted) cancel(late.body); }, () => {});
        response = await until(pending, task.signal);
        check(task.signal);
        if (response.redirected || ["opaque", "opaqueredirect"].includes(response.type) || response.url && response.url !== url) throw new TypeError("Torii replay changed response origin or resource");
        if (response.status !== 200) throw new GameReplayHttpError(response.status);
        if (response.headers.get("content-type")?.toLowerCase() !== "application/octet-stream" || response.headers.has("content-encoding") || response.headers.has("content-range")) throw new TypeError("Torii replay returned unexpected media, encoding or range");
        if (response.headers.get("cache-control") !== "no-store" || response.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") throw new TypeError("Torii replay requires no-store and nosniff response headers");
        const length = response.headers.get("content-length");
        if (length === null || !/^[1-9][0-9]*$/.test(length)) throw new TypeError("Torii replay requires exact canonical Content-Length");
        const expected = positive(Number(length), maximum, "Torii replay Content-Length");
        if (expected < 40) throw new RangeError("Torii replay is shorter than a native archive header");
        if (!response.body) throw new TypeError("Torii replay has no response body");
        reader = response.body.getReader();
        while (true) {
          const chunk = await until(reader.read(), task.signal);
          if (chunk.done) { done = true; break; }
          if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > expected - total) throw new RangeError("Torii replay exceeds its exact declared length");
          for (let offset = 0; offset < chunk.value.byteLength; offset += CHUNK_BYTES) {
            check(task.signal);
            const bytes = chunk.value.slice(offset, offset + CHUNK_BYTES);
            await until(write(bytes), task.signal);
            check(task.signal);
            total += bytes.byteLength;
          }
        }
        if (total !== expected) throw new TypeError("Torii replay stream ended before its declared length");
        check(task.signal);
        return freeze({ assurance: "endpoint-reported", request, bytesWritten: total });
      } catch (error) { task.abort(error); throw error; }
      finally {
        if (reader) { if (!done) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Preserve failure. */ } } reader.releaseLock(); }
        else cancel(response?.body);
        task.close();
      }
    },
  });
}
