import { spawn } from 'node:child_process';
import { open, mkdir, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readBoundedNativeFile, hashBoundedNativePath, nativeFileModulePath } from './native-file-io.mjs';


const HASH = /^[0-9a-f]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_LIMIT = 16 * 1024 * 1024;
const BINARY_LIMIT = 2 * 1024 * 1024 * 1024;
const PROVENANCE_LIMIT = 4 * 1024 * 1024;
const LAUNCHER = 'javascript/iroha_js/verify-pinned-native.mjs';
const fileDigest = async (path, limit) => (await hashBoundedNativePath(path, limit)).sha256;
const json = value => JSON.stringify(value, null, 2) + '\n';
const absolute = (value, name) => {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`Set ${name} to an explicit absolute path.`);
  return resolve(value);
};
const inside = (root, path) => { const part = relative(root, path); return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); };

const describeError = error => error instanceof Error
  ? { name: error.name, message: error.message, ...(error instanceof AggregateError ? { errors: error.errors.map(describeError) } : {}) }
  : { name: 'ThrownValue', message: String(error) };

/** Attempt every owned cleanup even after failures. The caller preserves a pending primary
 * exception when cleanup succeeds; if cleanup fails, retain it together with all cleanup errors.
 * Actions run in order so closing a descriptor may precede removing its file on every platform.
 */
export async function cleanupNativeResources(actions, primaryError, report, context) {
  const failures = [];
  for (const action of actions) {
    try { await action.run(); }
    catch (error) { failures.push({ resource: action.resource, error }); }
  }
  if (!failures.length) return;
  report.cleanupErrors ??= [];
  report.cleanupErrors.push(...failures.map(({ resource, error }) => ({ context, resource, ...describeError(error) })));
  if (primaryError !== undefined) report.primaryError = describeError(primaryError);
  throw new AggregateError([
    ...(primaryError === undefined ? [] : [primaryError]), ...failures.map(failure => failure.error),
  ], `${context}: ${primaryError === undefined ? '' : `${describeError(primaryError).message}; `}owned cleanup failed for ${failures.map(failure => failure.resource).join(', ')}.`,
  primaryError === undefined ? undefined : { cause: primaryError });
}

async function sourceSnapshot(sourcePaths, readSource) {
  const sources = {};
  for (const name of sourcePaths) {
    sources[name] = digest(await readSource(name));
  }
  return sources;
}

async function runExport(binary, nativeRoot, evidenceDir, command, name, cap, report) {
  const output = join(evidenceDir, name);
  // The owned evidence directory is new and each command runs once. Never remove a prior export.
  let stdout, stderr, primaryError;
  const invocation = { argv: [binary, '--machine', 'app', 'execution', command, '--output-file', output], cwd: nativeRoot, pid: null, exitCode: null, signal: null, timedOut: false };
  try {
    stdout = await open(join(evidenceDir, `${command}.stdout.log`), 'wx');
    stderr = await open(join(evidenceDir, `${command}.stderr.log`), 'wx');
    report.commands.push(invocation);
    await new Promise((resolvePromise, reject) => {
      const child = spawn(binary, invocation.argv.slice(1), { cwd: nativeRoot, shell: false, stdio: ['ignore', stdout.fd, stderr.fd] });
      invocation.pid = child.pid ?? null;
      let killTimer, spawnError;
      const timer = setTimeout(() => { invocation.timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }, 120_000);
      child.once('error', error => { spawnError = error; });
      child.once('close', (code, signal) => {
        clearTimeout(timer); clearTimeout(killTimer); invocation.exitCode = code; invocation.signal = signal;
        if (spawnError) reject(spawnError);
        else if (code === 0 && !invocation.timedOut) resolvePromise();
        else reject(new Error(`Native ${command} failed: code=${code}, signal=${signal}, timedOut=${invocation.timedOut}. See retained command logs.`));
      });
    });
  } catch (error) { primaryError = error; throw error; }
  finally {
    await cleanupNativeResources([
      ...(stdout ? [{ resource: `${command}.stdout.log descriptor`, run: () => stdout.close() }] : []),
      ...(stderr ? [{ resource: `${command}.stderr.log descriptor`, run: () => stderr.close() }] : []),
    ], primaryError, report, `Native ${command}`);
  }
  const bytes = await readBoundedNativeFile(output, cap);
  report.artifacts[name] = { bytes: bytes.length, sha256: digest(bytes) };
  return JSON.parse(bytes.toString('utf8'));
}

async function previousArtifacts(appRoot, artifacts, limits) {
  const previous = {};
  for (const [name, destination] of Object.entries(artifacts)) {
    const path = join(appRoot, destination), limit = limits[name];
    const bytes = await readBoundedNativeFile(path, limit);
    previous[name] = { path, bytes, sha256: digest(bytes), limit };
  }
  return previous;
}

async function writeOwnedTemporary(path, bytes, retain, report) {
  const file = await open(path, 'wx');
  retain(); // Ownership begins only after exclusive creation succeeds.
  let primaryError;
  try { await file.writeFile(bytes); }
  catch (error) { primaryError = error; throw error; }
  finally {
    await cleanupNativeResources([{ resource: `${path} descriptor`, run: () => file.close() }], primaryError, report, 'Native temporary write');
  }
}

async function installArtifacts(appRoot, evidenceDir, previous, assertStable, report) {
  const lockPath = join(appRoot, 'output', '.native-generation-install.lock');
  const lock = await open(lockPath, 'wx');
  const prepared = [], installed = [], restores = [];
  let primaryError;
  try {
    await lock.writeFile(json({ pid: process.pid, evidenceDir }));
    await mkdir(join(evidenceDir, 'previous'));
    for (const [name, before] of Object.entries(previous)) {
      if (await fileDigest(before.path, before.limit) !== before.sha256) throw new Error(`Generated destination changed during export: ${name}`);
      await writeFile(join(evidenceDir, 'previous', name), before.bytes, { flag: 'wx' });
      const temporary = `${before.path}.native-${randomUUID()}.tmp`;
      const bytes = await readBoundedNativeFile(join(evidenceDir, name), before.limit);
      if (digest(bytes) !== report.artifacts[name].sha256) throw new Error(`Retained export changed before installation: ${name}`);
      await writeOwnedTemporary(temporary, bytes, () => prepared.push({ name, path: before.path, temporary }), report);
    }
    await assertStable();
    for (const item of prepared) {
      if (await fileDigest(item.path, previous[item.name].limit) !== previous[item.name].sha256) throw new Error(`Generated destination changed before installation: ${item.name}`);
    }
    for (const item of prepared) { await rename(item.temporary, item.path); installed.push(item); }
    for (const item of installed) {
      if (await fileDigest(item.path, previous[item.name].limit) !== report.artifacts[item.name].sha256) throw new Error(`Installed artifact mismatch: ${item.name}`);
    }
    await assertStable();
    report.installed = true;
  } catch (error) {
    // Roll back only bytes still equal to this invocation's output; never overwrite another writer.
    const rollbackErrors = [];
    for (const item of installed.reverse()) {
      try {
        if (await fileDigest(item.path, previous[item.name].limit) !== report.artifacts[item.name].sha256) throw new Error('destination changed after installation');
        const temporary = `${item.path}.restore-${randomUUID()}.tmp`;
        await writeOwnedTemporary(temporary, previous[item.name].bytes, () => restores.push(temporary), report);
        await rename(temporary, item.path);
      } catch (rollbackError) { rollbackErrors.push({ name: item.name, error: rollbackError }); }
    }
    report.rollbackErrors = rollbackErrors.map(({name, error}) => ({name, ...describeError(error)}));
    primaryError = rollbackErrors.length
      ? new AggregateError([error, ...rollbackErrors.map(item => item.error)], `Installation failed; inspect retained previous files before recovery: ${rollbackErrors.map(item => item.name).join(', ')}`, { cause: error })
      : error;
    throw primaryError;
  } finally {
    await cleanupNativeResources([
      ...prepared.map(item => ({ resource: item.temporary, run: () => rm(item.temporary, { force: true }) })),
      ...restores.map(path => ({ resource: path, run: () => rm(path, { force: true }) })),
      { resource: 'installation lock descriptor', run: () => lock.close() },
      { resource: lockPath, run: () => rm(lockPath) },
    ], primaryError, report, 'Native artifact installation');
  }
}

/** Local build orchestration only. Callers supply a closed, code-owned computation descriptor;
 * no JSON export may select commands, paths, source inventories or validation functions.
 */
export async function generateNativeArtifacts(options, profile) {
  const { artifacts, sourcePaths, verifySources, validateExports, kernelCommand, parityCommand,
    kernelFile, parityFile, provenanceFile } = profile;
  const appRoot = await realpath(absolute(options.appRoot, 'appRoot'));
  const nativeRoot = await realpath(absolute(options.nativeRoot, 'SORA_CARS_IROHA_ROOT'));
  const binary = await realpath(absolute(options.binary, 'SORA_CARS_IROHA_CLI'));
  const requestedEvidenceDir = absolute(options.evidenceDir, 'SORA_CARS_NATIVE_EXPORT_DIR');
  if (!HASH.test(options.expectedCliSha256 ?? '')) throw new Error('Expected CLI SHA-256 is required.');
  if (!inside(nativeRoot, binary)) throw new Error('Selected CLI must reside in the selected native checkout.');
  const artifactRoot = await realpath(join(appRoot, 'output'));
  const evidenceParent = await realpath(dirname(requestedEvidenceDir));
  if (evidenceParent !== artifactRoot && !inside(artifactRoot, evidenceParent)) throw new Error('Evidence parent escapes the app output directory.');
  const evidenceDir = join(evidenceParent, basename(requestedEvidenceDir));
  if (!inside(artifactRoot, evidenceDir)) throw new Error('Evidence directory must be a new path inside the app output directory.');
  await mkdir(evidenceDir); // EEXIST is an error; failed/successful runs are never reused.
  const generator = {};
  const report = { version: 1, computation: profile.computation, generator, nativeRoot, binary, expectedCliSha256: options.expectedCliSha256, evidenceDir, startedAt: new Date().toISOString(), commands: [], artifacts: {}, installed: false, cryptographicQualification: false, status: 'running' };
  let capture, primaryError;
  try {
    const limits = { [kernelFile]: profile.kernelByteLimit, [parityFile]: profile.parityByteLimit, [provenanceFile]: PROVENANCE_LIMIT };
    if (Object.keys(artifacts).length !== 3 || Object.keys(artifacts).some(name => !Object.hasOwn(limits, name))) throw new Error('Invalid closed native artifact inventory.');
    const sourceNames = new Set(sourcePaths);
    const readSource = async name => {
      if (!sourceNames.has(name)) throw new Error(`Native source is outside the closed source inventory: ${name}`);
      const path = await realpath(join(nativeRoot, name));
      if (!inside(nativeRoot, path)) throw new Error(`Native source escapes selected checkout: ${name}`);
      return readBoundedNativeFile(path, SOURCE_LIMIT);
    };
    const launcherPath = await realpath(join(nativeRoot, LAUNCHER));
    if (!inside(nativeRoot, launcherPath)) throw new Error('Native launcher escapes selected checkout.');
    const generatorFiles = {
      scriptSha256: fileURLToPath(profile.generatorUrl), lifecycleSha256: fileURLToPath(import.meta.url),
      sourceVerifierSha256: fileURLToPath(profile.sourceVerifierUrl), boundedIoSha256: nativeFileModulePath,
    };
    for (const [key, path] of Object.entries(generatorFiles)) generator[key] = await fileDigest(path, SOURCE_LIMIT);
    const launcherBytes = await readBoundedNativeFile(launcherPath, 1024 * 1024);
    generator.nativeLauncherSha256 = digest(launcherBytes);
    const retainedLauncher = join(evidenceDir, 'native-launcher.mjs');
    await writeFile(retainedLauncher, launcherBytes, { flag: 'wx', mode: 0o400 });
    if (await fileDigest(binary, BINARY_LIMIT) !== options.expectedCliSha256) throw new Error('Native CLI digest differs from the independently pinned executable.');
    const launcher = await import(pathToFileURL(retainedLauncher).href);
    capture = launcher.capturePinnedNativeArtifact(binary, options.expectedCliSha256);
    // The SDK owns this directory; normalize macOS's /var temporary alias
    // before applying direct-file checks to its captured executable.
    const capturedPath = await realpath(capture.executable);
    const capturedPin = await hashBoundedNativePath(capturedPath, BINARY_LIMIT);
    if (capturedPin.sha256 !== options.expectedCliSha256) throw new Error('Captured native CLI digest differs from the independent pin.');
    report.capturedBinary = { path: capturedPath, ...capturedPin,
      launcher: { source: launcherPath, retained: retainedLauncher, bytes: launcherBytes.length, sha256: generator.nativeLauncherSha256 } };
    const before = await sourceSnapshot(sourcePaths, readSource);
    const assertStable = async () => {
      for (const executable of [binary, capturedPath]) {
        if (await fileDigest(executable, BINARY_LIMIT) !== options.expectedCliSha256) throw new Error('Native CLI digest differs from the independently pinned executable.');
      }
      if (JSON.stringify(await sourceSnapshot(sourcePaths, readSource)) !== JSON.stringify(before)) throw new Error('Native sources changed during export; retain this attempt and retry after source freeze.');
      for (const [key, path] of Object.entries(generatorFiles)) {
        if (await fileDigest(path, SOURCE_LIMIT) !== generator[key]) throw new Error('Native generator changed during export.');
      }
      for (const path of [launcherPath, retainedLauncher]) {
        if (await fileDigest(path, 1024 * 1024) !== generator.nativeLauncherSha256) throw new Error('Native artifact launcher changed during export.');
      }
    };
    await assertStable();
    const previous = options.install ? await previousArtifacts(appRoot, artifacts, limits) : null;
    await writeFile(join(evidenceDir, 'sources-before.json'), json(before), { flag: 'wx' });
    const kernels = await runExport(capturedPath, nativeRoot, evidenceDir, kernelCommand, kernelFile, profile.kernelByteLimit, report);
    await assertStable();
    await verifySources(kernels, readSource);
    const parity = await runExport(capturedPath, nativeRoot, evidenceDir, parityCommand, parityFile, profile.parityByteLimit, report);
    await assertStable();
    validateExports(kernels, parity);
    await verifySources(kernels, readSource);
    const provenance = { version: 1, ...profile.provenanceFields(kernels, parity), generator, nativeCliSha256: options.expectedCliSha256, nativeRoot, capturedBinary: report.capturedBinary, exportEvidenceDir: evidenceDir, commands: report.commands, rulesHash: kernels.rules_hash, profileId: kernels.profile_id, sources: kernels.sources, profileSources: kernels.profile_sources, grids: 21, cryptographicQualification: false };
    const provenanceBytes = Buffer.from(json(provenance));
    if (provenanceBytes.length > PROVENANCE_LIMIT) throw new Error('Native provenance exceeds its byte bound.');
    await writeFile(join(evidenceDir, provenanceFile), provenanceBytes, { flag: 'wx' });
    report.artifacts[provenanceFile] = { bytes: provenanceBytes.length, sha256: digest(provenanceBytes) };
    await writeFile(join(evidenceDir, 'sources-after.json'), json(await sourceSnapshot(sourcePaths, readSource)), { flag: 'wx' });
    await assertStable();
    if (options.install) await installArtifacts(appRoot, evidenceDir, previous, assertStable, report);
    report.status = 'passed';
  } catch (error) { primaryError = error; report.status = 'failed'; report.error = error.message; report.errorDetails = describeError(error); }
  try {
    await cleanupNativeResources(capture ? [{ resource: 'captured native executable', run: () => capture.cleanup() }] : [], primaryError, report, 'Native artifact capture');
  } catch (error) { primaryError = error; report.status = 'failed'; report.error = error.message; report.errorDetails = describeError(error); }
  report.finishedAt = new Date().toISOString();
  try { await writeFile(join(evidenceDir, 'report.json'), json(report), { flag: 'wx' }); }
  catch (error) {
    if (primaryError !== undefined) throw new AggregateError([primaryError, error], 'Native generation and report persistence failed.', { cause: primaryError });
    throw error;
  }
  if (primaryError !== undefined) throw primaryError;
  return report;
}
