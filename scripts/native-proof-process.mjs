import { spawn } from 'node:child_process';
import path from 'node:path';

export const NATIVE_PROCESS_LIMITS = Object.freeze({ timeoutMs: 30 * 60_000, outputBytes: 1024 * 1024, terminateGraceMs: 2000, reapGraceMs: 5000 });
function reduction(value, maximum, name) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name} limit.`);
  return value;
}
/** Public-data-only subprocess. Optional limits can only tighten production bounds for tests. */
export async function runNativeProofProcess(binary, args, cwd, timeoutMs = NATIVE_PROCESS_LIMITS.timeoutMs, limits = {}) {
  if (!path.isAbsolute(binary) || binary.includes('\0') || !path.isAbsolute(cwd)) throw new Error('Native proving requires absolute binary and private working-directory paths.');
  reduction(timeoutMs, NATIVE_PROCESS_LIMITS.timeoutMs, 'native timeout');
  const outputBytes = reduction(limits.outputBytes ?? NATIVE_PROCESS_LIMITS.outputBytes, NATIVE_PROCESS_LIMITS.outputBytes, 'native output');
  const terminateGraceMs = reduction(limits.terminateGraceMs ?? NATIVE_PROCESS_LIMITS.terminateGraceMs, NATIVE_PROCESS_LIMITS.terminateGraceMs, 'termination grace');
  const reapGraceMs = reduction(limits.reapGraceMs ?? NATIVE_PROCESS_LIMITS.reapGraceMs, NATIVE_PROCESS_LIMITS.reapGraceMs, 'reap grace');
  const grouped = process.platform !== 'win32';
  const child = spawn(binary, args, { cwd, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: cwd }, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let stdoutBytes = 0, stderrBytes = 0, failure, terminating = false, settled = false, killTimer, reapTimer;
  const chunks = [];
  return await new Promise((resolve, reject) => {
    const signal = name => {
      if (!child.pid) return;
      try { if (grouped) process.kill(-child.pid, name); else child.kill(name); }
      catch (error) { if (error.code !== 'ESRCH') failure ??= error; }
    };
    const finish = (code, error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(reapTimer);
      if (error || failure) reject(error ?? failure);
      else if (code !== 0) reject(new Error('The native proving or verification process failed.'));
      else resolve(Buffer.concat(chunks, stdoutBytes).toString('utf8').trim());
    };
    const terminate = error => {
      failure ??= error;
      if (terminating || settled) return;
      terminating = true; signal('SIGTERM');
      killTimer = setTimeout(() => {
        signal('SIGKILL');
        reapTimer = setTimeout(() => {
          // Do not free a worker's proving slot when process/pipe closure was
          // never observed. The caller must retain a blocked state for restart.
          const unreaped = Object.assign(new Error('Native process did not close after forced termination; worker restart required.'), { nativeProcessUnreaped: true });
          child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
          finish(null, unreaped);
        }, reapGraceMs);
      }, terminateGraceMs);
    };
    const timer = setTimeout(() => terminate(Object.assign(new Error('Native proving or verification timed out.'), { code: 'NATIVE_PROCESS_TIMEOUT' })), timeoutMs);
    child.stdout?.on('data', data => {
      stdoutBytes += data.length;
      if (stdoutBytes > outputBytes) terminate(new Error('Native process output exceeded its bound.'));
      else chunks.push(data);
    });
    child.stderr?.on('data', data => {
      stderrBytes += data.length;
      if (stderrBytes > outputBytes) terminate(new Error('Native process output exceeded its bound.'));
    });
    child.once('error', error => { failure ??= error; if (!child.pid) finish(null, error); else terminate(error); });
    // 'exit' can precede the last stdout bytes. Only 'close' certifies that the
    // process and its stdio streams have finished; timeout failures never clear.
    child.once('close', code => finish(code));
  });
}
