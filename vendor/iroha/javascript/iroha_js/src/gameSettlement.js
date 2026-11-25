import { sha256 } from "@noble/hashes/sha2";
import {
  noritoEncodeGameCertifiedSettlementExportRequestV1, noritoDecodeGameCertifiedSettlementExportRequestV1,
  noritoEncodeGameCertifiedSettlementDownloadHeaderV1, noritoDecodeGameCertifiedSettlementDownloadHeaderV1,
} from "./norito.js";

export const GAME_SETTLEMENT_MAX_REQUEST_BYTES_V1 = 4096;
export const GAME_SETTLEMENT_MAX_HEADER_BYTES_V1 = 4096;
export const GAME_SETTLEMENT_MAX_DOWNLOAD_BYTES_V1 = 256 * 1024 * 1024;
export const GAME_SETTLEMENT_FILE_ROLES_V1 = Object.freeze([
  "finality", "source_block", "source_merge", "source_write_set", "settled_block", "settled_merge", "settled_write_set",
]);
const ROLE_CAPS = [GAME_SETTLEMENT_MAX_DOWNLOAD_BYTES_V1, 32*1024*1024, 16*1024*1024, 64*1024*1024, 32*1024*1024, 16*1024*1024, 64*1024*1024];
const CHUNK_BYTES = 64 * 1024;
export const encodeGameCertifiedSettlementExportRequestV1 = noritoEncodeGameCertifiedSettlementExportRequestV1;
export const decodeGameCertifiedSettlementExportRequestV1 = noritoDecodeGameCertifiedSettlementExportRequestV1;
export const encodeGameCertifiedSettlementDownloadHeaderV1 = noritoEncodeGameCertifiedSettlementDownloadHeaderV1;
export const decodeGameCertifiedSettlementDownloadHeaderV1 = noritoDecodeGameCertifiedSettlementDownloadHeaderV1;

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
  const timer = setTimeout(() => controller.abort(new Error("Torii settlement transfer deadline exceeded")), milliseconds);
  return { signal: controller.signal, abort: reason => controller.abort(reason), close() { clearTimeout(timer); signal?.removeEventListener("abort", stop); } };
}
function check(signal) { if (signal.aborted) throw signal.reason ?? new Error("Torii settlement transfer aborted"); }
function until(promise, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new Error("Torii settlement transfer aborted"));
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
export class GameSettlementHttpError extends Error {
  constructor(httpStatus) { super(`Torii game settlement HTTP ${httpStatus}`); this.name = "GameSettlementHttpError"; this.status = httpStatus; }
}

/** Download seven direct native .nrt files; return an unpublished descriptor after quiescence.
 * Network waits observe cancellation/deadlines. Every started sink operation and the
 * one-shot quiescence barrier are physically awaited without racing cancellation.
 * A sink may therefore delay total completion indefinitely. Each barrier settlement
 * must mean all I/O started by these callbacks has stopped and cannot mutate later.
 * Only after this method settles may the caller safely clean up private output.
 * Success leaves descriptor publication to a separate caller-owned abort-aware atomic
 * commit. A successful endpoint response is not verification.
 * The native CLI's fourteen independent expectations must remain supplied by the caller;
 * neither the downloaded header nor this descriptor provides them.
 */
export function createCertifiedGameSettlementClientV1(options) {
  if (!options || typeof options !== "object") throw new TypeError("Torii settlement options required");
  const origin = originOf(options.origin), url = `${origin}/v1/games/settlement/export`;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation required");
  const timeout = positive(options.transferTimeoutMs ?? 600_000, 600_000, "settlement transfer timeout");
  return Object.freeze({
    origin,
    async downloadSettlement(exportRequestBytes, sink, callOptions = {}) {
      if (!sink || ["writePart", "finishPart", "quiesce"].some(name => typeof sink[name] !== "function")) throw new TypeError("seven-file write/finish and physical quiescence sinks are required");
      if ("writeDescriptor" in sink) throw new TypeError("descriptor publication must be separate from the download sink");
      const maximum = positive(callOptions.maxDownloadBytes ?? GAME_SETTLEMENT_MAX_DOWNLOAD_BYTES_V1, GAME_SETTLEMENT_MAX_DOWNLOAD_BYTES_V1, "settlement download limit");
      const request = freeze(decodeGameCertifiedSettlementExportRequestV1(exportRequestBytes));
      const archive = encodeGameCertifiedSettlementExportRequestV1(request);
      const task = context(callOptions.signal, timeout);
      let response, reader, done = false, received = 0, current = new Uint8Array(), offset = 0;
      let sinkStarted = false, quiescence;
      function quiesce() {
        // Cache the real barrier promise before invoking caller code so synchronous
        // rejection and abort during the barrier cannot trigger a second invocation.
        if (!quiescence) quiescence = Promise.resolve().then(() => sink.quiesce());
        return quiescence;
      }
      async function physical(operation) {
        check(task.signal); sinkStarted = true;
        await operation(); // Never replace physical completion with logical abort.
        check(task.signal);
      }
      try {
        check(task.signal);
        const pending = Promise.resolve(fetchImpl(url, {
          method: "POST", body: new Blob([archive], { type: "application/octet-stream" }), signal: task.signal,
          credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "application/octet-stream", Accept: "application/octet-stream" },
        }));
        void pending.then(late => { if (task.signal.aborted) cancel(late.body); }, () => {});
        response = await until(pending, task.signal); check(task.signal);
        if (response.redirected || ["opaque", "opaqueredirect"].includes(response.type) || response.url && response.url !== url) throw new TypeError("Torii settlement changed response origin or resource");
        if (response.status !== 200) throw new GameSettlementHttpError(response.status);
        if (response.headers.get("content-type")?.toLowerCase() !== "application/octet-stream" || response.headers.has("content-encoding") || response.headers.has("content-range")) throw new TypeError("Torii settlement returned unexpected media, encoding or range");
        if (response.headers.get("cache-control") !== "no-store" || response.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") throw new TypeError("Torii settlement requires no-store and nosniff response headers");
        const length = response.headers.get("content-length");
        if (length === null || !/^[1-9][0-9]*$/.test(length)) throw new TypeError("Torii settlement requires exact canonical Content-Length");
        const expected = positive(Number(length), maximum, "Torii settlement Content-Length");
        if (expected < 47 || !response.body) throw new TypeError("Torii settlement is missing its bounded header/files");
        reader = response.body.getReader();
        async function pull() {
          while (offset === current.length) {
            check(task.signal);
            const value = await until(reader.read(), task.signal);
            if (value.done) { done = true; current = new Uint8Array(); offset = 0; return false; }
            if (!(value.value instanceof Uint8Array) || value.value.byteLength > expected - received) throw new RangeError("Torii settlement exceeds its exact declared length");
            current = value.value; offset = 0; received += current.length;
          }
          return true;
        }
        async function take(maximum) {
          if (!await pull()) throw new TypeError("Torii settlement ended before its exact file lengths");
          const count = Math.min(maximum, current.length - offset);
          const copy = current.slice(offset, offset + count); offset += count; return copy;
        }
        async function exact(count) {
          const result = new Uint8Array(count); let used = 0;
          while (used < count) { const bytes = await take(count-used); result.set(bytes,used); used+=bytes.length; }
          return result;
        }
        const prefix = await exact(40);
        // Untrusted geometry alone admits only a small bounded allocation. The full
        // native header decoder then checks schema, CRC, layout and canonical bytes.
        const payload = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getBigUint64(23,true);
        if (payload === 0n || payload > BigInt(GAME_SETTLEMENT_MAX_HEADER_BYTES_V1-40) || payload > BigInt(expected-40)) throw new RangeError("settlement header frame exceeds its byte cap");
        const frame = new Uint8Array(40+Number(payload)); frame.set(prefix); frame.set(await exact(Number(payload)),40);
        const header = decodeGameCertifiedSettlementDownloadHeaderV1(frame);
        const lengths = header.part_lengths.map((value,index) => positive(Number(value),ROLE_CAPS[index],"settlement role length"));
        if (lengths.reduce((sum,value)=>sum+value,frame.length) !== expected) throw new RangeError("settlement header/file lengths do not equal Content-Length");
        const files = {};
        for (let index=0;index<7;index++) {
          const role=GAME_SETTLEMENT_FILE_ROLES_V1[index], digest=sha256.create(); let remaining=lengths[index];
          while (remaining > 0) {
            const bytes = await take(Math.min(CHUNK_BYTES,remaining)); digest.update(bytes);
            await physical(() => sink.writePart(role,bytes,task.signal)); remaining-=bytes.length;
          }
          await physical(() => sink.finishPart(role,task.signal));
          files[role] = {file:`${role}.nrt`,sha256:Array.from(digest.digest(),byte=>byte.toString(16).padStart(2,"0")).join(""),bytes:lengths[index]};
        }
        if (await pull() || received !== expected) throw new TypeError("settlement transport has trailing or missing bytes");
        check(task.signal);
        const descriptor = freeze({format:"iroha.game.certified-settlement-files",version:1,files});
        await quiesce(); check(task.signal);
        // Immutable text is caller-owned publication data, never an async commit callback.
        const descriptorText = JSON.stringify(descriptor)+"\n";
        return freeze({assurance:"endpoint-reported",request,bytesWritten:received,descriptor,
          publicationState:"files-complete-unpublished",descriptorText});
      } catch (error) {
        task.abort(error);
        if (sinkStarted) {
          try { await quiesce(); }
          catch (barrierError) {
            if (barrierError !== error) throw new AggregateError([error,barrierError], `${String(error)}; sink quiescence also failed`);
          }
        }
        throw error;
      }
      finally {
        if (reader) { if (!done) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Preserve failure. */ } } reader.releaseLock(); }
        else cancel(response?.body);
        task.close();
      }
    },
  });
}
