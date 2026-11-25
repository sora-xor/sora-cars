import {
  noritoDecodeGameValueV1,
  noritoEncodeGameValueV1,
  noritoDecodeGameVerificationRequestV1,
  noritoEncodeGameVerificationRequestV1,
} from "./norito.js";
import { parseStrictLosslessIntegerJson } from "./strictLosslessJson.js";

export const GAME_WORKER_PROTOCOL_V1 = "iroha-game-worker-v1";
export const GAME_WORKER_MAX_REQUEST_BYTES_V1 = 4096;
export const GAME_WORKER_MAX_PROOF_BYTES_V1 = 512 * 1024 * 1024;
export const GAME_WORKER_MAX_REPLAY_BYTES_V1 = 4 * 1024 * 1024 * 1024;
export const GAME_WORKER_MAX_REPORT_JSON_BYTES_V1 = 1024 * 1024;
const MAX_STATUS_BYTES = GAME_WORKER_MAX_REPORT_JSON_BYTES_V1 + 4096;
const CHUNK_BYTES = 64 * 1024;
const PHASES = new Set(["awaiting_upload", "uploading", "running", "cancelling", "complete", "draining", "failed"]);
const REPORT_U64 = ["revision", "carrier_height", "proof_bytes", "replay_bytes"];

/** Encode the complete canonical native request archive from independently selected pins. */
export const encodeGameVerificationRequestV1 = noritoEncodeGameVerificationRequestV1;
/** Decode a native request archive. Decoding does not authenticate its trust pins. */
export const decodeGameVerificationRequestV1 = noritoDecodeGameVerificationRequestV1;

function closedObject(value, names, context) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${context} must be a plain object`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || names.some(key => !keys.includes(key))) throw new TypeError(`${context} has missing or unknown fields`);
  for (const name of names) {
    const field = Object.getOwnPropertyDescriptor(value, name);
    if (!field?.enumerable || !Object.hasOwn(field, "value")) throw new TypeError(`${context} requires data properties`);
  }
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function nativeReport(value) {
  // The native JSON wire emits integer tokens, never quoted decimal strings.
  for (const key of REPORT_U64) if (typeof value?.[key] !== "number" && typeof value?.[key] !== "bigint") throw new TypeError(`native report ${key} requires an integer token`);
  if (typeof value?.components !== "number" || typeof value?.proofs !== "number" || typeof value?.outcome?.terminal_tick !== "number") throw new TypeError("native report u32 fields require integer tokens");
  const result = noritoDecodeGameValueV1("GameExecutionReportV1", noritoEncodeGameValueV1("GameExecutionReportV1", value));
  positive(result.components, 0xffff_ffff, "native report components");
  positive(result.proofs, result.components, "native report proofs");
  if (result.computation.kind === "stock_race" && (result.components !== 1 || result.proofs !== 1)) throw new RangeError("native StockRace report requires one component and one proof");
  // Counts are endpoint claims; only native verification authenticates the
  // complete selected segment plan. Never derive its width in this parser.
  // Keep unsafe integers lossless and preserve every qualification flag.
  return freeze(result);
}

/** Parse a bounded, closed native Norito JSON report; u64 values normalize to decimal strings.
 * This is endpoint-reported data, never an independently authenticated verification receipt.
 */
export function parseGameExecutionReportV1(text) {
  if (typeof text !== "string" || text.length > GAME_WORKER_MAX_REPORT_JSON_BYTES_V1 || new TextEncoder().encode(text).length > GAME_WORKER_MAX_REPORT_JSON_BYTES_V1) throw new RangeError("native report exceeds the JSON byte limit");
  return nativeReport(parseStrictLosslessIntegerJson(text, "GameExecutionReportV1"));
}

function positive(value, maximum, context) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RangeError(`${context} must be 1..${maximum}`);
  return value;
}

function workerOrigin(value) {
  if (typeof value !== "string") throw new TypeError("worker origin must be explicit");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || ![url.origin, `${url.origin}/`].includes(value)) throw new TypeError("worker endpoint must be a canonical HTTP(S) origin without credentials or paths");
  return url.origin;
}

function context(signal, timeout) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal) {
    if (!(signal instanceof AbortSignal)) throw new TypeError("signal must be an AbortSignal");
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("native game worker request deadline exceeded")), timeout);
  return { signal: controller.signal, abort: reason => controller.abort(reason), close: () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); } };
}

function checkSignal(signal) {
  if (signal.aborted) throw signal.reason ?? new Error("native game worker request aborted");
}

function until(promise, signal) {
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("native game worker request aborted"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function cancelBody(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Preserve the original protocol error. */ }
}

function media(response, expected) {
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (contentType !== expected && !(expected === "application/json" && /^application\/json;\s*charset=utf-8$/.test(contentType ?? ""))) throw new TypeError("native game worker returned an unexpected content type");
  if (response.headers.has("content-encoding")) throw new TypeError("native game worker returned encoded content");
}

function contentLength(response, maximum, required) {
  const value = response.headers.get("content-length");
  if (value === null && !required) return null;
  if (value === null || !/^(?:0|[1-9][0-9]*)$/.test(value)) throw new TypeError("native game worker requires canonical Content-Length");
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 1 || length > maximum) throw new RangeError("native game worker Content-Length exceeds the bound");
  return length;
}

async function readJson(response, signal) {
  media(response, "application/json");
  const declared = contentLength(response, MAX_STATUS_BYTES, false);
  if (!response.body) throw new TypeError("native game worker response has no body");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", done = false;
  try {
    while (true) {
      const chunk = await until(reader.read(), signal);
      if (chunk.done) { done = true; break; }
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > MAX_STATUS_BYTES - bytes) throw new RangeError("native game worker status exceeds the byte limit");
      bytes += chunk.value.byteLength;
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (declared !== null && bytes !== declared) throw new TypeError("native game worker status length mismatch");
    return parseStrictLosslessIntegerJson(text, "native game worker status");
  } finally {
    if (!done) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Stream already failed. */ } }
    reader.releaseLock();
  }
}

function status(value, expectedId, request, replayBytes) {
  if (!value || typeof value !== "object") throw new TypeError("invalid native game worker status");
  const names = ["protocol", "id", "status", "replay_path", "status_path"];
  if (value.status === "complete") names.push("report", "proof_path");
  if (value.status === "failed") names.push("error");
  closedObject(value, names, "native game worker status");
  if (value.protocol !== GAME_WORKER_PROTOCOL_V1 || typeof value.id !== "string" || !/^[0-9a-f]{64}$/.test(value.id) || expectedId !== null && value.id !== expectedId || !PHASES.has(value.status)) throw new TypeError("unknown native game worker protocol, job or status");
  const path = `/v1/jobs/${value.id}`;
  if (value.replay_path !== `${path}/replay` || value.status_path !== path) throw new TypeError("native game worker returned an unexpected relative path");
  if (value.status === "failed" && value.error !== "native_job_failed") throw new TypeError("native game worker returned an unknown failure code");
  let report;
  if (value.status === "complete") {
    if (value.proof_path !== `${path}/proof`) throw new TypeError("native game worker returned an unexpected proof path");
    report = nativeReport(value.report);
    for (const [field, selected] of [["network_id", request.network_id], ["session_id", request.session_id], ["revision", request.revision], ["carrier_height", request.target_height], ["carrier_hash", request.target_block_hash]]) if (report[field] !== selected) throw new TypeError(`native game worker report does not match selected ${field}`);
    if (report.computation.kind !== request.computation.kind || report.outcome.terminal_tick !== request.terminal_tick || replayBytes !== null && BigInt(report.replay_bytes) !== BigInt(replayBytes)) throw new TypeError("native game worker report does not match selected computation or replay");
    positive(Number(report.proof_bytes), GAME_WORKER_MAX_PROOF_BYTES_V1, "native proof bytes");
    positive(Number(report.replay_bytes), GAME_WORKER_MAX_REPLAY_BYTES_V1, "native replay bytes");
  }
  return freeze({ ...value, ...(report ? { report } : {}), assurance: "endpoint-reported" });
}

/** A public transport failure. HTTP success or a report never grants ledger authority. */
export class GameProofWorkerHttpError extends Error {
  constructor(httpStatus) {
    super(`native game worker HTTP ${httpStatus}`);
    this.name = "GameProofWorkerHttpError";
    this.status = httpStatus;
  }
}

/** Create an origin-bound public native worker client with no wallet or custody keys.
 * Jobs accept a separately exported replay Blob; local driving data cannot replace Kura evidence.
 */
export function createFinalizedGameWorkerClientV1(options) {
  if (!options || typeof options !== "object") throw new TypeError("native game worker options required");
  const origin = workerOrigin(options.origin);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation required");
  const requestTimeoutMs = positive(options.requestTimeoutMs ?? 30_000, 600_000, "request timeout");
  const transferTimeoutMs = positive(options.transferTimeoutMs ?? 600_000, 86_400_000, "transfer timeout");

  async function fetchResponse(path, method, body, task, expectedStatus) {
    const url = `${origin}${path}`;
    checkSignal(task.signal);
    const response = await until(fetchImpl(url, {
      method, body, signal: task.signal, credentials: "omit", redirect: "error",
      cache: "no-store", referrerPolicy: "no-referrer",
      headers: body ? { "Content-Type": "application/octet-stream" } : {},
    }), task.signal);
    try {
      if (response.redirected || response.type === "opaque" || response.type === "opaqueredirect" || response.url && response.url !== url) throw new TypeError("native game worker changed response origin or resource");
      if (response.status !== expectedStatus) throw new GameProofWorkerHttpError(response.status);
      return response;
    } catch (error) { cancelBody(response.body); throw error; }
  }

  async function json(path, method, body, options, expectedStatus) {
    const task = context(options?.signal, method === "PUT" ? transferTimeoutMs : requestTimeoutMs);
    let response;
    try {
      response = await fetchResponse(path, method, body, task, expectedStatus);
      return await readJson(response, task.signal);
    } catch (error) { task.abort(error); cancelBody(response?.body); throw error; }
    finally { task.close(); }
  }

  return Object.freeze({
    origin,
    async reserve(requestBytes, callOptions = {}) {
      // Decode and copy synchronously before any request to avoid caller mutation during upload.
      const request = freeze(decodeGameVerificationRequestV1(requestBytes));
      const archive = encodeGameVerificationRequestV1(request);
      const reserved = status(await json("/v1/jobs", "POST", new Blob([archive], { type: "application/octet-stream" }), callOptions, 202), null, request, null);
      if (reserved.status !== "awaiting_upload") throw new TypeError("native game worker did not reserve an upload");
      const id = reserved.id, path = `/v1/jobs/${id}`;
      let replayBytes = null, uploadAttempted = false;
      const getStatus = async (statusOptions = {}) => status(await json(path, "GET", undefined, statusOptions, 200), id, request, replayBytes);
      return Object.freeze({
        id, request,
        async uploadReplay(replay, uploadOptions = {}) {
          if (uploadAttempted) throw new Error("native game replay upload was already attempted; reserve a new job after closure");
          // Invoke the built-in Blob getter: do not accept an unknown-length duck-typed body.
          const size = Object.getOwnPropertyDescriptor(Blob.prototype, "size").get.call(replay);
          positive(size, GAME_WORKER_MAX_REPLAY_BYTES_V1, "native replay bytes");
          const body = Blob.prototype.slice.call(replay, 0, size, "application/octet-stream");
          uploadAttempted = true;
          replayBytes = size;
          const result = status(await json(`${path}/replay`, "PUT", body, uploadOptions, 202), id, request, replayBytes);
          if (result.status !== "running") throw new TypeError("native game worker did not accept the replay");
          return result;
        },
        status: getStatus,
        async cancel(cancelOptions = {}) {
          const result = status(await json(path, "DELETE", undefined, cancelOptions, 202), id, request, replayBytes);
          if (!["cancelling", "draining", "failed"].includes(result.status)) throw new TypeError("native game worker did not acknowledge closure");
          return result;
        },
        /** Stream exact complete proof bytes to an awaited sink. On error the sink may contain
         * partial data: publish a file only after this method resolves, then verify it natively.
         */
        async downloadProof(write, downloadOptions = {}) {
          if (typeof write !== "function") throw new TypeError("a bounded proof write sink is required");
          const current = await getStatus(downloadOptions);
          if (current.status !== "complete") throw new Error("native game worker proof is not complete");
          const expected = Number(current.report.proof_bytes);
          const task = context(downloadOptions.signal, transferTimeoutMs);
          let response, reader, done = false, total = 0;
          try {
            response = await fetchResponse(`${path}/proof`, "GET", undefined, task, 200);
            media(response, "application/octet-stream");
            if (response.headers.has("content-range") || contentLength(response, GAME_WORKER_MAX_PROOF_BYTES_V1, true) !== expected) throw new TypeError("native proof response length differs from report");
            if (!response.body) throw new TypeError("native proof response has no body");
            reader = response.body.getReader();
            while (true) {
              const chunk = await until(reader.read(), task.signal);
              if (chunk.done) { done = true; break; }
              if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > expected - total) throw new RangeError("native proof exceeds the exact declared length");
              for (let offset = 0; offset < chunk.value.byteLength; offset += CHUNK_BYTES) {
                const bytes = chunk.value.slice(offset, offset + CHUNK_BYTES);
                checkSignal(task.signal);
                await until(write(bytes), task.signal);
                total += bytes.byteLength;
              }
            }
            if (total !== expected) throw new TypeError("native proof stream ended before its declared length");
            checkSignal(task.signal);
            return freeze({ assurance: "endpoint-reported", report: current.report, bytesWritten: total });
          } catch (error) { task.abort(error); throw error; }
          finally {
            if (reader) {
              if (!done) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Preserve the read/sink failure. */ } }
              reader.releaseLock();
            } else cancelBody(response?.body);
            task.close();
          }
        },
      });
    },
  });
}
