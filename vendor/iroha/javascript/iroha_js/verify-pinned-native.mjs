#!/usr/bin/env node
/** Execute an independently pinned artifact; this does not authenticate its source provenance. */
import { createHash } from 'node:crypto';
import { constants, closeSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
function binaryPath(value) {
  const names = isAbsolute(value) || value.includes('/') || value.includes('\\')
    ? [resolve(value)]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, value));
  if (process.platform === 'win32' && !value.toLowerCase().endsWith('.exe')) names.push(...names.map(name => `${name}.exe`));
  for (const name of names) {
    try { const path = realpathSync(name); if (lstatSync(path).isFile()) return path; } catch { /* Try next explicit PATH entry. */ }
  }
  throw new Error('Pinned native executable was not found.');
}
function privateDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'iroha-verified-artifact-'));
  try {
    if (process.platform === 'win32') {
      const system = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
      const owner = spawnSync(join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
      const sid = owner.status === 0 ? owner.stdout.match(/"(S-1-[0-9-]+)"\s*$/m)?.[1] : undefined;
      if (!sid) throw new Error('Cannot establish the owner identity for the private artifact directory.');
      const acl = spawnSync(join(system, 'icacls.exe'), [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { encoding: 'utf8', windowsHide: true });
      if (acl.status !== 0) throw new Error('Cannot restrict the private artifact directory to its owner.');
    } else {
      const stat = lstatSync(directory);
      if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error('Artifact directory is not private to its owner.');
    }
    return directory;
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
}
/** Capture and hash the same bytes that will execute; never execute the mutable build path. */
export function capturePinnedNativeArtifact(binary, expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error('An independently pinned lowercase artifact SHA-256 is required.');
  const source = binaryPath(binary), directory = privateDirectory();
  const executable = join(directory, process.platform === 'win32' ? 'iroha.exe' : 'iroha');
  let input, output;
  try {
    input = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(input);
    if (!before.isFile() || before.size === 0 || before.size > MAX_ARTIFACT_BYTES) throw new Error('Native artifact exceeds file bounds.');
    output = openSync(executable, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0, count;
    while ((count = readSync(input, buffer, 0, buffer.length, null)) !== 0) {
      total += count;
      if (total > MAX_ARTIFACT_BYTES) throw new Error('Native artifact grew beyond its bound.');
      const bytes = buffer.subarray(0, count); hash.update(bytes);
      for (let written = 0; written < count;) {
        const n = writeSync(output, bytes, written, count - written);
        if (!n) throw new Error('Native artifact capture did not advance.');
        written += n;
      }
    }
    if (total !== before.size || hash.digest('hex') !== expectedSha256) throw new Error('Native artifact SHA-256 differs from the independently pinned build record.');
    fsyncSync(output); fchmodSync(output, 0o500);
    closeSync(output); output = undefined; closeSync(input); input = undefined;
    return Object.freeze({ executable, cleanup: () => rmSync(directory, { recursive: true, force: true }) });
  } catch (error) {
    if (output !== undefined) closeSync(output);
    if (input !== undefined) closeSync(input);
    rmSync(directory, { recursive: true, force: true }); throw error;
  }
}
export async function runPinnedNativeArtifact(binary, expectedSha256, args) {
  let capture, child;
  // Install ownership before capture so ordinary cancellation cannot abandon a
  // partial copy or let the parent exit while its retained child is still running.
  const forwarded = (process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP']).map(signal => {
    const handler = () => { if (child && child.exitCode === null && child.signalCode === null) child.kill(signal); };
    process.on(signal, handler); return [signal, handler];
  });
  try {
    capture = capturePinnedNativeArtifact(binary, expectedSha256);
    return await new Promise((resolveRun, rejectRun) => {
      child = spawn(capture.executable, args, { stdio: 'inherit', shell: false });
      let spawnError;
      child.on('error', error => { spawnError = error; });
      child.once('close', (code, signal) => {
        if (spawnError) rejectRun(spawnError);
        else resolveRun(code ?? (128 + (osConstants.signals[signal] ?? 1)));
      });
    });
  } finally {
    for (const [name, handler] of forwarded) process.removeListener(name, handler);
    capture?.cleanup();
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 6 || args[0] !== '--binary' || args[2] !== '--sha256' || args[4] !== '--') throw new Error('Usage: iroha-verify-pinned --binary <iroha-path> --sha256 <trusted-build-artifact-sha256> -- <iroha arguments>');
  process.exitCode = await runPinnedNativeArtifact(args[1], args[3], args.slice(5));
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
