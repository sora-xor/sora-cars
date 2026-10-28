import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, readdir, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, join, dirname, basename, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { blake3 } from '@noble/hashes/blake3';

export function selectNativePacker(env) {
  const standalone = env.SORA_CARS_SORAFS_CLI, toolkit = env.SORA_CARS_IROHA_BIN;
  if (Boolean(standalone) === Boolean(toolkit)) throw new Error('Set exactly one reviewed native binary: SORA_CARS_IROHA_BIN (Iroha Toolkit) or SORA_CARS_SORAFS_CLI (standalone).');
  const binary = toolkit || standalone;
  if (!isAbsolute(binary)) throw new Error('The reviewed native packer path must be absolute.');
  return { binary, mode: toolkit ? 'iroha-toolkit' : 'standalone' };
}
async function digestFile(path, algorithm = 'sha256') {
  const hash = algorithm === 'blake3' ? blake3.create() : createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return Buffer.from(hash.digest()).toString('hex');
}
async function inventory(directory, prefix = '') {
  const files = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('SoraFS release input must contain regular files, not symlinks.');
    const path = `${prefix}${entry.name}`, absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(absolute, `${path}/`));
    else if (entry.isFile()) files.push({ path, bytes: (await stat(absolute)).size, sha256: await digestFile(absolute) });
    else throw new Error('Unsupported static release input.');
  }
  return files;
}
/** Keep native work bounded while allowing complete multi-gigabyte media releases. */
export function nativePackTimeoutMs(payloadBytes) {
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0) throw new RangeError('Payload size must be a non-negative safe integer.');
  const tenMinutes = 600_000;
  return Math.min(3_600_000, Math.max(tenMinutes, Math.ceil(payloadBytes / (1024 ** 3)) * tenMinutes));
}
async function run(binary, args, cwd, timeoutMs) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8' } });
    const chunks = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 };
    let failure;
    const deadline = setTimeout(() => { failure = new Error(`Native local pack exceeded its ${timeoutMs / 60_000}-minute payload-size budget.`); child.kill('SIGKILL'); }, timeoutMs);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', bytes => {
      sizes[stream] += bytes.length;
      if (sizes[stream] > 8 * 1024 * 1024) { failure = new Error('Native local pack output exceeds its bound.'); child.kill('SIGKILL'); }
      else chunks[stream].push(bytes);
    });
    child.once('error', error => { clearTimeout(deadline); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(deadline);
      const result = Object.fromEntries(Object.entries(chunks).map(([key, value]) => [key, Buffer.concat(value).toString('utf8')]));
      if (failure || code !== 0) reject(failure || new Error(`Native local pack exited ${code ?? signal}: ${result.stderr.slice(0, 2000)}`));
      else done(result);
    });
  });
}
async function validateToolkitReport(out) {
  const reportPath = join(out, 'sora-cars.pack.json');
  if ((await stat(reportPath)).size > 8 * 1024 * 1024) throw new Error('Native pack report exceeds its bound.');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const manifest = report.manifest;
  const hex = value => typeof value === 'string' && /^(?:[0-9a-f]{2})+$/.test(value);
  const bytes = await readFile(join(out, 'sora-cars.manifest.to'));
  const carSize = (await stat(join(out, 'sora-cars.car'))).size;
  const carDigest = await digestFile(join(out, 'sora-cars.car'), 'blake3');
  const manifestDigest = Buffer.from(blake3(bytes)).toString('hex');
  if (report.schema !== 'sorafs.toolkit_pack_report.v1' || !manifest || !hex(report.car_root_hex)
      || manifest.root_cid_hex !== report.car_root_hex || !hex(report.car_cid_hex) || manifest.car_cid_hex !== report.car_cid_hex
      || report.car_size !== carSize || manifest.car_size !== carSize || carSize === 0
      || report.car_archive_digest_hex !== carDigest || manifest.car_digest_hex !== carDigest
      || report.manifest_digest_hex !== manifestDigest || manifest.digest_hex !== manifestDigest
      || report.manifest_size !== bytes.length || manifest.manifest_len !== bytes.length || !bytes.length
      || manifest.manifest_hex !== bytes.toString('hex') || manifest.pin_policy?.min_replicas !== 3
      || !Array.isArray(manifest.alias_claims) || manifest.alias_claims.length !== 0
      || !Array.isArray(report.chunk_digests) || report.chunk_count !== report.chunk_digests.length
      || report.chunk_count < 1 || report.por_chunk_count !== report.chunk_count
      || !Array.isArray(report.chunk_fetch_specs) || report.chunk_fetch_specs.length !== report.chunk_count
      || !/^[0-9a-f]{64}$/.test(report.por_root_hex) || manifest.por_root_hex !== report.por_root_hex) {
    throw new Error('Native Toolkit report does not match the CAR, Norito manifest, CID-only policy and chunk commitments.');
  }
  return { native_root_cid_hex: report.car_root_hex, car_archive_blake3: carDigest, manifest_blake3: manifestDigest, requested_replicas: 3 };
}

export async function packSoraFs({ binary, mode, root = resolve('dist'), out = resolve('output/sorafs') }) {
  if (!isAbsolute(binary) || !['iroha-toolkit', 'standalone'].includes(mode)) throw new Error('Select an absolute reviewed native packer and explicit supported mode.');
  root = resolve(root); out = resolve(out);
  const outputRelativeToInput = relative(root, out);
  if (outputRelativeToInput === '' || (!isAbsolute(outputRelativeToInput) && outputRelativeToInput !== '..' && !outputRelativeToInput.startsWith(`..${sep}`))) throw new Error('Package output must be outside the static input directory.');
  await access(binary); await access(join(root, 'index.html'));
  try { await access(out); throw new Error('Package output already exists. Select a new SORA_CARS_SORAFS_OUTPUT directory to preserve existing evidence.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const files = await inventory(root), binarySha256 = await digestFile(binary);
  const sourcePayloadBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const nativeTimeoutMs = nativePackTimeoutMs(sourcePayloadBytes);
  await mkdir(dirname(out), { recursive: true });
  const staging = await mkdtemp(join(dirname(out), `.${basename(out)}-`));
  const path = name => join(staging, name);
  const commands = mode === 'iroha-toolkit' ? [
    ['--machine', 'app', 'sorafs', 'toolkit', 'pack', root, '--car-out', path('sora-cars.car'), '--manifest-out', path('sora-cars.manifest.to'), '--json-out', path('sora-cars.pack.json')],
  ] : [
    ['car', 'pack', `--input=${root}`, `--car-out=${path('sora-cars.car')}`, `--plan-out=${path('sora-cars.plan.json')}`, `--summary-out=${path('sora-cars.car.json')}`],
    ['manifest', 'build', `--summary=${path('sora-cars.car.json')}`, `--manifest-out=${path('sora-cars.manifest.to')}`, `--manifest-json-out=${path('sora-cars.manifest.json')}`, '--pin-min-replicas=3', '--metadata=app=sora-cars', '--metadata=publication=CidOnly'],
    ['storage', 'prepare', `--manifest=${path('sora-cars.manifest.to')}`, `--payload=${root}`, `--payload-out=${path('sora-cars.payload.bin')}`, `--files-out=${path('sora-cars.files.json')}`, `--summary-out=${path('sora-cars.storage.json')}`],
  ];
  try {
    for (const [index, args] of commands.entries()) {
      const result = await run(binary, args, root, nativeTimeoutMs);
      await writeFile(path(`native-${index}.stdout.log`), result.stdout);
      await writeFile(path(`native-${index}.stderr.log`), result.stderr);
    }
    let native = null;
    if (mode === 'iroha-toolkit') native = await validateToolkitReport(staging);
    else for (const name of ['sora-cars.car', 'sora-cars.plan.json', 'sora-cars.manifest.to', 'sora-cars.payload.bin', 'sora-cars.files.json', 'sora-cars.storage.json']) {
      if ((await stat(path(name))).size === 0) throw new Error(`Native packer emitted empty ${name}.`);
    }
    if (JSON.stringify(await inventory(root)) !== JSON.stringify(files)) throw new Error('Static build changed during native packing. Rebuild and repack before publication.');
    if (await digestFile(binary) !== binarySha256) throw new Error('Native packer binary changed during packaging.');
    await writeFile(path('files.json'), JSON.stringify({ version: 1, kind: 'sora-cars-static-inventory', published: false, files }, null, 2));
    const receipt = { version: 1, kind: 'sora-cars-local-native-pack', mode, binary, binary_sha256: binarySha256, source_commit_authenticated: false, source_payload_bytes: sourcePayloadBytes, native_timeout_ms: nativeTimeoutMs, commands, native, published: false, provider_availability_verified: false, provider_payload_prepared: mode === 'standalone' };
    await writeFile(path('local-pack.json'), JSON.stringify(receipt, null, 2));
    await rename(staging, out);
    return receipt;
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(process.env.SORA_CARS_SORAFS_OUTPUT || 'output/sorafs');
  const result = await packSoraFs({ ...selectNativePacker(process.env), out });
  console.log(`Native ${result.mode} CAR and Norito manifest prepared in ${out}. No upload, publication or provider availability is claimed.${result.provider_payload_prepared ? ' Separate provider payload included.' : ' Provider ingestion payload remains a separate native step.'}`);
}
