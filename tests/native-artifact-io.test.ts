import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, access, open, stat, appendFile, truncate, rename, realpath, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { generateNativeArtifacts, type NativeArtifactProfile } from '../scripts/lib/native-artifact-generation.mjs';
import { readBoundedNativeFile, nativeFileModulePath } from '../scripts/lib/native-file-io.mjs';
import { installNativeGeneratorLauncher } from './helpers/native-generator-launcher.ts';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const source = 'crates/test-only-source.rs';
// Synthetic subprocess/data only. Capture uses the byte-identical selected SDK implementation.
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'native-artifact-io-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = join(root, 'app'), nativeRoot = join(root, 'native'), binary = join(nativeRoot, 'target/debug/iroha');
  await mkdir(join(appRoot, 'output'), { recursive: true });
  await mkdir(dirname(binary), { recursive: true });
  await mkdir(dirname(join(nativeRoot, source)), { recursive: true });
  await writeFile(join(nativeRoot, source), 'source fixture bytes');
  const launcherPin = await installNativeGeneratorLauncher(nativeRoot);
  const program = `#!${process.execPath}\nconst fs=require('node:fs');\nconst args=process.argv.slice(2);\nif(args.slice(0,3).join(' ')!=='--machine app execution'||args[4]!=='--output-file')process.exit(21);\nif(fs.existsSync('original-backup'))fs.renameSync('original-backup','target/debug/iroha');\nfs.writeFileSync(args[5],JSON.stringify({kind:args[3]}),{flag:'wx'});\n`;
  await writeFile(binary, program); await chmod(binary, 0o755);
  const artifacts = { 'kernels.json': 'generated/kernels.json', 'parity.json': 'generated/parity.json', 'provenance.json': 'generated/provenance.json' };
  await mkdir(join(appRoot, 'generated'));
  for (const [name, destination] of Object.entries(artifacts)) await writeFile(join(appRoot, destination), `previous:${name}`);
  const options = { appRoot, nativeRoot, binary, evidenceDir: join(appRoot, 'output/attempt'), expectedCliSha256: hash(program), install: true };
  const profile: NativeArtifactProfile = { computation: 'TestOnly', artifacts, sourcePaths: [source],
    verifySources: async (_kernels, read) => { assert.equal((await read(source)).toString(), 'source fixture bytes'); },
    validateExports: (kernels, parity) => { assert.deepEqual(kernels, { kind: 'kernels' }); assert.deepEqual(parity, { kind: 'parity' }); },
    kernelCommand: 'kernels', parityCommand: 'parity', kernelFile: 'kernels.json', parityFile: 'parity.json', provenanceFile: 'provenance.json',
    kernelByteLimit: 32 * 1024 * 1024, parityByteLimit: 64 * 1024 * 1024,
    generatorUrl: import.meta.url, sourceVerifierUrl: import.meta.url, provenanceFields: () => ({ syntheticFixture: true }) };
  return { root, options, profile, launcherPin };
}
async function assertPrevious(appRoot: string, profile: NativeArtifactProfile) {
  for (const [name, destination] of Object.entries(profile.artifacts)) assert.equal(await readFile(join(appRoot, destination), 'utf8'), `previous:${name}`);
}
async function reportAt(evidence: string) { return JSON.parse(await readFile(join(evidence, 'report.json'), 'utf8')); }

test('bounded generator rejects real post-stat growth and truncation of exports, sources and previous artifacts', async t => {
  for (const target of ['export', 'source', 'previous'] as const) for (const change of ['grow', 'truncate'] as const) await t.test(`${target}/${change}`, async sub => {
    const { options, profile } = await fixture(sub);
    const path = target === 'export' ? join(options.evidenceDir, 'kernels.json') : target === 'source' ? join(options.nativeRoot, source) : join(options.appRoot, 'generated/kernels.json');
    const probe = await open(options.binary, 'r'), prototype = Object.getPrototypeOf(probe);
    const originalStat = prototype.stat, originalRead = prototype.read; await probe.close();
    let changed = false, selectedFd = -1, size = 0, reads = 0;
    sub.mock.method(prototype, 'stat', async function (this: Awaited<ReturnType<typeof open>>) {
      const current = await originalStat.call(this);
      if (!changed) {
        let targetStat;
        try { targetStat = await stat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (targetStat && current.ino === targetStat.ino && current.dev === targetStat.dev) {
          changed = true; selectedFd = this.fd; size = current.size;
          if (change === 'grow') await appendFile(path, 'x'.repeat(4096)); else await truncate(path, 1);
        }
      }
      return current;
    });
    sub.mock.method(prototype, 'read', async function (this: Awaited<ReturnType<typeof open>>, buffer: Buffer, offset: number, length: number, position: number) {
      if (this.fd === selectedFd) { reads++; assert.equal(buffer.length, size + 1); assert.ok(length <= size + 1); }
      return originalRead.call(this, buffer, offset, length, position);
    });
    await assert.rejects(generateNativeArtifacts(options, profile), /changed while reading/);
    assert.equal(changed, true); assert.ok(reads > 0);
    const report = await reportAt(options.evidenceDir); assert.equal(report.status, 'failed'); assert.equal(report.installed, false);
    assert.equal(report.commands.length, target === 'export' ? 1 : 0);
    await assert.rejects(access(report.capturedBinary.path), { code: 'ENOENT' });
    if (target !== 'previous') await assertPrevious(options.appRoot, profile);
  });
});

test('generator hashes a growing or truncated executable using bounded chunks and fails before capture or spawn', async t => {
  for (const change of ['grow', 'truncate'] as const) await t.test(change, async sub => {
    const { options, profile } = await fixture(sub), expected = await stat(options.binary);
    const probe = await open(options.binary, 'r'), prototype = Object.getPrototypeOf(probe);
    const originalStat = prototype.stat, originalRead = prototype.read; await probe.close();
    let changed = false, selectedFd = -1, reads = 0;
    sub.mock.method(prototype, 'stat', async function (this: Awaited<ReturnType<typeof open>>) {
      const current = await originalStat.call(this);
      if (!changed && current.ino === expected.ino && current.dev === expected.dev) {
        changed = true; selectedFd = this.fd;
        if (change === 'grow') await appendFile(options.binary, 'x'.repeat(65536)); else await truncate(options.binary, 1);
      }
      return current;
    });
    sub.mock.method(prototype, 'read', async function (this: Awaited<ReturnType<typeof open>>, buffer: Buffer, offset: number, length: number, position: number) {
      if (this.fd === selectedFd) { reads++; assert.ok(buffer.length <= 65536); assert.ok(position + length <= expected.size + 1); }
      return originalRead.call(this, buffer, offset, length, position);
    });
    await assert.rejects(generateNativeArtifacts(options, profile), /changed while hashing/);
    assert.ok(changed && reads > 0); assert.equal((await reportAt(options.evidenceDir)).commands.length, 0);
    await assertPrevious(options.appRoot, profile);
  });
});

test('the actual SDK capture executes the pinned bytes while the original executable is replaced and restored', async t => {
  const { options, profile, launcherPin } = await fixture(t);
  const verify = profile.verifySources; let swapped = false;
  profile.verifySources = async (kernels, read) => {
    await verify(kernels, read);
    if (!swapped) {
      swapped = true;
      await rename(options.binary, join(options.nativeRoot, 'original-backup'));
      const attack = `#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync('attacker-ran','wrong executable');fs.renameSync('original-backup','target/debug/iroha');fs.writeFileSync(process.argv.at(-1),JSON.stringify({kind:'parity'}));\n`;
      await writeFile(options.binary, attack); await chmod(options.binary, 0o755);
    }
  };
  const report = await generateNativeArtifacts(options, profile);
  assert.equal(swapped, true); assert.equal(report.status, 'passed'); assert.equal(report.installed, true);
  const capture = report.capturedBinary!;
  assert.notEqual(capture.path, options.binary); assert.equal(capture.sha256, options.expectedCliSha256);
  assert.equal(capture.launcher.sha256, launcherPin.sha256); assert.equal(capture.launcher.bytes, launcherPin.bytes);
  assert.equal(hash(await readFile(capture.launcher.retained)), launcherPin.sha256);
  assert.equal(report.generator.boundedIoSha256, hash(await readFile(nativeFileModulePath)));
  assert.equal(report.commands.length, 2);
  for (const command of report.commands) { assert.equal(command.argv[0], capture.path); assert.equal(command.exitCode, 0); }
  await assert.rejects(access(join(options.nativeRoot, 'attacker-ran')), { code: 'ENOENT' });
  await assert.rejects(access(capture.path), { code: 'ENOENT' });
  assert.equal(hash(await readFile(options.binary)), options.expectedCliSha256);
});

test('capture cleanup failure is retained with the primary failure and written as failed evidence', async t => {
  const { options, profile } = await fixture(t), primary = new Error('deliberate validation failure'), cleanup = new Error('deliberate capture cleanup failure');
  profile.validateExports = () => { throw primary; };
  const originalRm = fs.rmSync;
  let cleanupDirectory: string | undefined;
  t.mock.method(fs, 'rmSync', (path: fs.PathLike, options?: fs.RmOptions) => {
    if (String(path).includes('iroha-verified-artifact-')) { cleanupDirectory = String(path); throw cleanup; }
    return originalRm(path, options);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(generateNativeArtifacts(options, profile), error => {
      assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [primary, cleanup]); assert.equal(error.cause, primary); return true;
    });
    const report = await reportAt(options.evidenceDir);
    assert.equal(report.status, 'failed'); assert.equal(report.cleanupErrors[0].message, cleanup.message); assert.equal(report.primaryError.message, primary.message);
    assert.equal(report.commands.length, 2); await assertPrevious(options.appRoot, profile);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    if (cleanupDirectory !== undefined) originalRm(cleanupDirectory, { recursive: true, force: true });
  }
});

test('bounded reader keeps the primary error when closing the owned descriptor also fails', async t => {
  const { options } = await fixture(t), probe = await open(options.binary, 'r'), prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const primary = new Error('read failed'), cleanup = new Error('close failed');
  t.mock.method(prototype, 'read', async function (this: Awaited<ReturnType<typeof open>>) {
    const close = this.close.bind(this);
    t.mock.method(this, 'close', async () => { await close(); throw cleanup; });
    throw primary;
  });
  await assert.rejects(readBoundedNativeFile(options.binary), error => {
    assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [primary, cleanup]); assert.equal(error.cause, primary); return true;
  });
});

test('a report write failure does not swallow the native generation failure or replace existing evidence', async t => {
  const { options, profile } = await fixture(t), primary = new Error('validation failed before report');
  profile.validateExports = () => { throw primary; };
  const verify = profile.verifySources;
  profile.verifySources = async (kernels, read) => { await verify(kernels, read); await writeFile(join(options.evidenceDir, 'report.json'), 'preexisting evidence', { flag: 'wx' }); };
  await assert.rejects(generateNativeArtifacts(options, profile), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.errors[0], primary); assert.equal(error.errors[1].code, 'EEXIST'); return true;
  });
  assert.equal(await readFile(join(options.evidenceDir, 'report.json'), 'utf8'), 'preexisting evidence');
  await assertPrevious(options.appRoot, profile);
});

test('post-install source drift rolls back only this invocation and removes owned temporary files and lock', async t => {
  const { options, profile } = await fixture(t), destination = join(options.appRoot, 'generated/kernels.json');
  const before = await stat(destination), probe = await open(options.binary, 'r'), prototype = Object.getPrototypeOf(probe);
  const originalStat = prototype.stat; await probe.close(); let changed = false;
  t.mock.method(prototype, 'stat', async function (this: Awaited<ReturnType<typeof open>>) {
    const current = await originalStat.call(this), installed = await stat(destination);
    if (!changed && current.ino === installed.ino && current.dev === installed.dev && installed.ino !== before.ino) {
      changed = true; await appendFile(join(options.nativeRoot, source), '\nsource drift after installation');
    }
    return current;
  });
  await assert.rejects(generateNativeArtifacts(options, profile), /sources changed/);
  assert.equal(changed, true); await assertPrevious(options.appRoot, profile);
  const report = await reportAt(options.evidenceDir); assert.deepEqual(report.rollbackErrors, []); assert.equal(report.installed, false);
  await assert.rejects(access(join(options.appRoot, 'output/.native-generation-install.lock')), { code: 'ENOENT' });
  assert.deepEqual((await readdir(join(options.appRoot, 'generated'))).sort(), ['kernels.json', 'parity.json', 'provenance.json']);
});

test('changed retained export bytes are rejected before installing them or touching previous destinations', async t => {
  const { options, profile } = await fixture(t), verify = profile.verifySources;
  let checks = 0;
  profile.verifySources = async (kernels, read) => {
    await verify(kernels, read);
    if (++checks === 2) await writeFile(join(options.evidenceDir, 'kernels.json'), '{"changed":true}');
  };
  await assert.rejects(generateNativeArtifacts(options, profile), /Retained export changed before installation/);
  assert.equal(checks, 2); await assertPrevious(options.appRoot, profile);
  const report = await reportAt(options.evidenceDir); assert.equal(report.installed, false); assert.equal(report.status, 'failed');
  assert.deepEqual(report.rollbackErrors, []);
  await assert.rejects(access(join(options.appRoot, 'output/.native-generation-install.lock')), { code: 'ENOENT' });
});
