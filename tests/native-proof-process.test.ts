import { currentGameFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { encodeGameValueV1 } from '@iroha/iroha-js/game';
import { runNativeProofProcess, NATIVE_PROCESS_LIMITS } from '../scripts/native-proof-process.mjs';
const generic = currentGameFixtures();
const vector = (name: string) => generic.vectors.find((v: { name: string }) => v.name === name)!.value;
const request = vector('RaceProverRequestV1');
async function privateDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sora-worker-boundary-test-'));
  try { return await callback(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test('actual native subprocess waits for inherited stdout to close after its parent exits', async () => {
  await privateDirectory(async directory => {
    const lateWriter = "setTimeout(() => process.stdout.write(JSON.stringify({ drained: true })), 80)";
    const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(lateWriter)}], { stdio: ['ignore', process.stdout, process.stderr] }); process.exit(0);`;
    const output = await runNativeProofProcess(process.execPath, ['-e', parent], directory, 3000);
    assert.deepEqual(JSON.parse(output), { drained: true });
  });
});

for (const termBehavior of ['ignore', 'exit-zero'] as const) test(`actual subprocess timeout fails and reaps a child that will ${termBehavior}`, async () => {
  await privateDirectory(async directory => {
    const program = `require('node:fs').writeFileSync('pid', String(process.pid)); process.on('SIGTERM', () => { ${termBehavior === 'exit-zero' ? 'process.exit(0);' : ''} }); setInterval(() => {}, 10);`;
    const start = Date.now();
    await assert.rejects(runNativeProofProcess(process.execPath, ['-e', program], directory, 1000, { terminateGraceMs: 50, reapGraceMs: 1000 }), { code: 'NATIVE_PROCESS_TIMEOUT' });
    assert.ok(Date.now() - start < 4000, 'timeout and forced termination must be bounded');
    const pid = Number(await fs.readFile(path.join(directory, 'pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  });
});

test('actual child output limits terminate the process, and process overrides can only tighten bounds', async () => {
  await privateDirectory(async directory => {
    await assert.rejects(runNativeProofProcess(process.execPath, ['-e', "process.stdout.write('x'.repeat(2048)); setInterval(() => {}, 10)"], directory, 3000, { outputBytes: 1024, terminateGraceMs: 50, reapGraceMs: 1000 }), /output exceeded/);
    await assert.rejects(runNativeProofProcess(process.execPath, ['-e', ''], directory, NATIVE_PROCESS_LIMITS.timeoutMs + 1), /Invalid native timeout/);
    await assert.rejects(runNativeProofProcess(process.execPath, ['-e', ''], directory, 1000, { outputBytes: NATIVE_PROCESS_LIMITS.outputBytes + 1 }), /Invalid native output/);
    const inspection = JSON.parse(await runNativeProofProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({ env: process.env, cwd: process.cwd() }))'], directory, 3000));
    // macOS may add this encoding hint after spawn; it is not a forwarded
    // parent variable or a home/configuration/custody path.
    if (process.platform === 'darwin' && inspection.env.__CF_USER_TEXT_ENCODING !== undefined) { assert.match(inspection.env.__CF_USER_TEXT_ENCODING, /^0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+$/); delete inspection.env.__CF_USER_TEXT_ENCODING; }
    assert.deepEqual(inspection.env, { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: directory });
    assert.equal(await fs.realpath(inspection.cwd), await fs.realpath(directory));
  });
});

test('optional wrapper invokes actual children in the same public-only environment and private working directory', async () => {
  await privateDirectory(async directory => {
    const executable = path.join(directory, 'native-fixture.cjs'), input = path.join(directory, 'request.json'), output = path.join(directory, 'bundle.json');
    const wire = Buffer.from(encodeGameValueV1('ExecutionProofEnvelopeV1', vector('ExecutionProofEnvelopeV1'))).toString('base64');
    const program = `#!${process.execPath}\nconst fs = require('node:fs'); const path = require('node:path');
if (process.platform === 'darwin' && /^0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+$/.test(process.env.__CF_USER_TEXT_ENCODING ?? '')) delete process.env.__CF_USER_TEXT_ENCODING;
if (JSON.stringify(Object.keys(process.env).sort()) !== JSON.stringify(['LANG','PATH','TMPDIR']) || process.env.LANG !== 'C.UTF-8' || process.env.PATH !== '/usr/bin:/bin' || fs.realpathSync(process.cwd()) !== fs.realpathSync(process.env.TMPDIR) || fs.realpathSync(process.cwd()) === fs.realpathSync(${JSON.stringify(directory)})) process.exit(71);
if (process.argv[4] === 'prove') fs.writeFileSync(process.argv.at(-1), Buffer.from(${JSON.stringify(wire)}, 'base64'));
else if (process.argv[4] === 'verify') process.stdout.write(${JSON.stringify(JSON.stringify(vector('GameOutcomeV1')))});
else process.exit(72);\n`;
    await fs.writeFile(executable, program, { mode: 0o700 }); await fs.writeFile(input, JSON.stringify(request));
    const wrapper = path.resolve('scripts/prove-replay.mjs');
    const child = spawn(process.execPath, [wrapper, input, output], { cwd: directory, env: { ...process.env, SORA_CARS_IROHA_BIN: executable, TEST_CUSTODY_SENTINEL: 'must-not-forward', RAYON_NUM_THREADS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostics = ''; child.stdout.on('data', chunk => { diagnostics += chunk; }); child.stderr.on('data', chunk => { diagnostics += chunk; });
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, diagnostics);
    const bundle = JSON.parse(await fs.readFile(output, 'utf8')); assert.deepEqual(bundle.proof, vector('ExecutionProofEnvelopeV1')); assert.deepEqual(bundle.outcome, vector('GameOutcomeV1'));
    assert.deepEqual((await fs.readdir(directory)).sort(), ['bundle.json', 'native-fixture.cjs', 'request.json']);
  });
});

