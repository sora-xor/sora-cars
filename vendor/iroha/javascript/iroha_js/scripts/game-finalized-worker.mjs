#!/usr/bin/env node
/** Explicit operator integration helper, not an automatic test or native verifier.
 * Node >=22: node scripts/game-finalized-worker.mjs ORIGIN REQUEST.nrt REPLAY.nrt PROOF.bin REPORT.json
 * Inputs must be exported native evidence with independently selected pins. No keys are accepted.
 */
import { openAsBlob } from "node:fs";
import { lstat, readFile, open, mkdtemp, link, unlink, rmdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createFinalizedGameWorkerClientV1, GAME_WORKER_MAX_REQUEST_BYTES_V1,
  GAME_WORKER_MAX_REPLAY_BYTES_V1,
} from "../src/gameProofWorker.js";
import { stringifyStrictLosslessIntegerJson } from "../src/strictLosslessJson.js";

const args = process.argv.slice(2);
if (args.length !== 5) throw new Error("Usage: game-finalized-worker.mjs ORIGIN REQUEST.nrt REPLAY.nrt PROOF.bin REPORT.json");
const [origin, requestName, replayName, proofName, reportName] = args;
const requestPath = resolve(requestName), replayPath = resolve(replayName);
const proofPath = resolve(proofName), reportPath = resolve(reportName);
if (new Set([requestPath, replayPath, proofPath, reportPath]).size !== 4) throw new Error("input and output paths must be distinct");
for (const [path, maximum] of [[requestPath, GAME_WORKER_MAX_REQUEST_BYTES_V1], [replayPath, GAME_WORKER_MAX_REPLAY_BYTES_V1]]) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > maximum) throw new Error("input must be one bounded regular file without aliases");
}
for (const path of [proofPath, reportPath]) {
  try { await lstat(path); throw new Error("output already exists"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

const stop = new AbortController();
const onSignal = () => stop.abort(new Error("operator interrupted native worker driver"));
process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);
const client = createFinalizedGameWorkerClientV1({
  origin, requestTimeoutMs: 30_000, transferTimeoutMs: 180_000,
  fetchImpl: async (url, init) => {
    const response = await fetch(url, init);
    process.stdout.write(`${JSON.stringify({ method: init.method, path: new URL(url).pathname, http_status: response.status })}\n`);
    return response;
  },
});
let job, work, output, publishedProof = false, publishedReport = false;
try {
  job = await client.reserve(new Uint8Array(await readFile(requestPath)), { signal: stop.signal });
  const replay = await openAsBlob(replayPath, { type: "application/octet-stream" });
  await job.uploadReplay(replay, { signal: stop.signal });
  const deadline = Date.now() + 180_000;
  let current, prior;
  while (true) {
    if (Date.now() >= deadline) throw new Error("native worker polling exceeded 180 seconds");
    const remaining = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    current = await job.status({ signal: AbortSignal.any([stop.signal, remaining]) });
    if (current.status !== prior) process.stdout.write(`${JSON.stringify({ phase: current.status, assurance: current.assurance })}\n`);
    prior = current.status;
    if (current.status === "complete") break;
    if (!["running", "uploading"].includes(current.status)) throw new Error(`native worker ended without a proof: ${current.status}`);
    await delay(Math.min(500, Math.max(1, deadline - Date.now())), undefined, { signal: stop.signal });
  }
  work = await mkdtemp(join(dirname(proofPath), ".native-game-proof-"));
  const stagedProof = join(work, "proof.bin");
  output = await open(stagedProof, "wx", 0o600);
  const result = await job.downloadProof(async bytes => {
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await output.write(bytes, offset, bytes.length - offset);
      if (bytesWritten === 0) throw new Error("proof sink made no write progress");
      offset += bytesWritten;
    }
  }, { signal: stop.signal });
  await output.sync(); await output.close(); output = null;
  // Restore native integer JSON tokens; every flag and report field is retained.
  const report = { ...result.report };
  for (const key of ["revision", "carrier_height", "proof_bytes", "replay_bytes"]) report[key] = BigInt(report[key]);
  const encodedReport = `${stringifyStrictLosslessIntegerJson(report, "native worker report")}\n`;
  const reportHandle = await open(reportPath, "wx", 0o600);
  publishedReport = true;
  try { await reportHandle.writeFile(encodedReport, "utf8"); await reportHandle.sync(); }
  finally { await reportHandle.close(); }
  await link(stagedProof, proofPath); publishedProof = true;
  process.stdout.write(`${JSON.stringify({ result: "downloaded", assurance: result.assurance, proof_bytes: result.bytesWritten,
    record_finality_verified: report.record_finality_verified, computation_verified: report.computation_verified,
    profile_registered: report.profile_registered, settlement_verified: report.settlement_verified,
    composed_security_qualified: report.composed_security_qualified })}\n`);
} catch (error) {
  if (output) { await output.close(); output = null; }
  if (publishedProof) await unlink(proofPath);
  if (publishedReport) await unlink(reportPath);
  if (job) {
    try { await job.cancel({ signal: AbortSignal.timeout(5000) }); }
    catch { /* Native expiry/cleanup remains the operator service's responsibility. */ }
  }
  throw error;
} finally {
  if (work) { await unlink(join(work, "proof.bin")).catch(error => { if (error.code !== "ENOENT") throw error; }); await rmdir(work); }
  process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
}
