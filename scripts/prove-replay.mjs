#!/usr/bin/env node
// Optional local proving process. Input and output contain only public game data, never wallet keys.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNativeProofProcess } from './native-proof-process.mjs';
import { encodeRaceValueV1 } from '@iroha/iroha-js/race';
import { decodeGameValueV1, EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 } from '@iroha/iroha-js/game';
const [requestPath, outputPath] = process.argv.slice(2);
if (!requestPath || !outputPath || process.argv.length !== 4) throw new Error('Usage: node scripts/prove-replay.mjs public-request.json proof-bundle.json');
const nativeCli = process.env.SORA_CARS_IROHA_BIN;
if (!nativeCli || !path.isAbsolute(nativeCli) || nativeCli.includes('\0')) throw new Error('Configure SORA_CARS_IROHA_BIN as an absolute native Iroha binary path.');
const stat = await fs.stat(requestPath);
if (stat.size > 96 * 1024 * 1024) throw new Error('Public proving request exceeds 96 MiB JSON limit.');
const request = JSON.parse(await fs.readFile(requestPath, 'utf8'));
const requestBytes = encodeRaceValueV1('RaceProverRequestV1', request);
if (requestBytes.byteLength > 20 * 1024 * 1024) throw new Error('Native proving request exceeds the native 20 MiB request limit.');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sora-cars-public-proof-'));
let unreaped = false;
const run = args => runNativeProofProcess(nativeCli, args, directory);
try {
  const job = path.join(directory, 'request.nrt'), result = path.join(directory, 'proof.nrt');
  await fs.writeFile(job, requestBytes, { mode: 0o600 });
  console.error('Proving the public replay using the native Iroha execution adapter…');
  await run(['app', 'execution', 'prove', '--request-kind', 'race-v1', '--request', job, '--output-file', result]);
  if ((await fs.stat(result)).size > EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1) throw new Error('Native proof exceeded the compiled execution envelope bound.');
  const proof = decodeGameValueV1('ExecutionProofEnvelopeV1', await fs.readFile(result));
  const outcome = JSON.parse(await run(['app', 'execution', 'verify', '--proof', result]));
  // Byte arrays can occupy four JSON bytes per proof byte; compact output shares the worker/browser bound.
  await fs.writeFile(outputPath, JSON.stringify({ proof, outcome }) + '\n', { flag: 'wx' });
  console.log(`Native proof and locally verified outcome written to ${outputPath}. The ledger independently verifies them again before payout.`);
} catch (error) { unreaped = error?.nativeProcessUnreaped === true; throw error; }
finally { if (!unreaped) await fs.rm(directory, { recursive: true, force: true }); }
