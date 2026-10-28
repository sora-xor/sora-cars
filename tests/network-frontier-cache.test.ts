import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('frontier agreement cache preserves authentication and hashes each retained body once for agreement', async () => {
  // Module interception is local to an owned test process. Ordinary npm test
  // needs no global experimental flags and production exposes no counters.
  const fixture = fileURLToPath(new URL('./fixtures/network-frontier-cache.ts', import.meta.url));
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const env = { ...process.env };
  // The outer test runner marks its subprocesses; the explicitly owned child
  // is a new runner, not a recursive invocation of that outer test context.
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['--experimental-test-module-mocks', '--import', 'tsx',
    '--test', '--test-reporter=tap', fixture], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', spawnError: Error | undefined;
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => { spawnError = error; });
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const evidence = `${stdout}\n${stderr}`;
  assert.equal(spawnError, undefined, evidence);
  assert.equal(result.signal, null, evidence);
  assert.equal(result.code, 0, evidence);
  assert.match(stdout, /^# tests 4$/m, evidence);
  assert.match(stdout, /^# pass 4$/m, evidence);
  assert.match(stdout, /^# fail 0$/m, evidence);
  assert.match(stdout, /^# skipped 0$/m, evidence);
});
