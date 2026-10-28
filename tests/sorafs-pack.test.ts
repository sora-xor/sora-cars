import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blake3 } from '@noble/hashes/blake3';
import { nativePackTimeoutMs, packSoraFs, selectNativePacker } from '../scripts/pack-sorafs.mjs';

// This executable substitutes only the packer process. Its bytes are deliberately
// not a real CAR/Norito manifest; these tests qualify wrapper admission and binding.
async function fixture(t: test.TestContext, behavior = 'valid') {
  const directory = await mkdtemp(join(tmpdir(), 'sora-cars-pack-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'dist'), out = join(directory, 'release'), binary = join(directory, 'mock native packer');
  await mkdir(root); await writeFile(join(root, 'index.html'), '<html>public local assets</html>');
  const car = Buffer.from('explicit test-process CAR substitute'), manifest = Buffer.from('explicit test-process manifest substitute');
  const digest = (bytes: Uint8Array) => Buffer.from(blake3(bytes)).toString('hex');
  const report = {
    schema: 'sorafs.toolkit_pack_report.v1', car_root_hex: '01551e20' + '11'.repeat(32), car_cid_hex: '01551e20' + '22'.repeat(32),
    car_size: car.length, car_archive_digest_hex: digest(car), manifest_digest_hex: digest(manifest), manifest_size: manifest.length,
    chunk_count: 1, por_chunk_count: 1, chunk_digests: [{}], chunk_fetch_specs: [{}], por_root_hex: '33'.repeat(32),
    manifest: { root_cid_hex: '01551e20' + '11'.repeat(32), car_cid_hex: '01551e20' + '22'.repeat(32), car_size: car.length,
      car_digest_hex: digest(car), digest_hex: digest(manifest), manifest_len: manifest.length, manifest_hex: manifest.toString('hex'),
      pin_policy: { min_replicas: 3 }, alias_claims: [], por_root_hex: '33'.repeat(32) },
  };
  const code = `#!${process.execPath}
import { writeFile, appendFile } from 'node:fs/promises';
const args = process.argv.slice(2), behavior = ${JSON.stringify(behavior)};
await appendFile(${JSON.stringify(join(directory, 'invocations.jsonl'))}, JSON.stringify({args, home:process.env.HOME ?? null, stdin:process.stdin.isTTY ?? false})+'\\n');
if (behavior === 'fail') { process.stderr.write('explicit native process failure'); process.exit(3); }
const value = flag => args.includes(flag) ? args[args.indexOf(flag)+1] : args.find(arg => arg.startsWith(flag+'='))?.slice(flag.length+1);
if (args[0] === '--machine') {
 if (args.slice(1,5).join(' ') !== 'app sorafs toolkit pack' || args.some(arg => /submit|upload|config|private-key/.test(arg))) throw new Error('wrong native local command');
 const report = ${JSON.stringify(report)};
 if (behavior === 'bad-digest') report.car_archive_digest_hex = '00'.repeat(32);
 if (behavior === 'alias') report.manifest.alias_claims = [{name:'unexpected'}];
 await writeFile(value('--car-out'), Buffer.from(${JSON.stringify(car.toString('hex'))},'hex'));
 if (behavior !== 'missing') await writeFile(value('--manifest-out'), Buffer.from(${JSON.stringify(manifest.toString('hex'))},'hex'));
 await writeFile(value('--json-out'), JSON.stringify(report));
 if (behavior === 'mutate') await writeFile(${JSON.stringify(join(root, 'index.html'))}, 'changed while packing');
} else {
 for (const flag of ['--car-out','--plan-out','--summary-out','--manifest-out','--manifest-json-out','--payload-out','--files-out']) {
  if (value(flag)) await writeFile(value(flag), 'explicit standalone process substitute');
 }
}
`;
  await writeFile(binary, code); await chmod(binary, 0o755);
  return { directory, root, out, binary, mode: 'iroha-toolkit' as const };
}

test('native packer selection requires one explicit absolute binary', () => {
  assert.throws(() => selectNativePacker({}), /exactly one/);
  assert.throws(() => selectNativePacker({ SORA_CARS_IROHA_BIN: '/one', SORA_CARS_SORAFS_CLI: '/two' }), /exactly one/);
  assert.throws(() => selectNativePacker({ SORA_CARS_IROHA_BIN: 'iroha' }), /absolute/);
  assert.deepEqual(selectNativePacker({ SORA_CARS_IROHA_BIN: '/native/iroha' }), { binary: '/native/iroha', mode: 'iroha-toolkit' });
});

test('native packing budgets complete large payloads and remains bounded', () => {
  assert.equal(nativePackTimeoutMs(0), 600_000);
  assert.equal(nativePackTimeoutMs(1024 ** 3), 600_000);
  assert.equal(nativePackTimeoutMs(1024 ** 3 + 1), 1_200_000);
  assert.equal(nativePackTimeoutMs(2_563_048_355), 1_800_000);
  assert.equal(nativePackTimeoutMs(16 * 1024 ** 3), 3_600_000);
  assert.equal(nativePackTimeoutMs(Number.MAX_SAFE_INTEGER), 3_600_000);
  for (const bytes of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => nativePackTimeoutMs(bytes), /safe integer/);
});

test('Toolkit process path binds CAR/report/manifest and records unpublished local provenance', async t => {
  const input = await fixture(t), receipt = await packSoraFs(input);
  assert.equal(receipt.mode, 'iroha-toolkit');
  assert.equal(receipt.published, false); assert.equal(receipt.provider_availability_verified, false);
  assert.equal(receipt.provider_payload_prepared, false); assert.equal(receipt.source_commit_authenticated, false);
  assert.equal(receipt.native_timeout_ms, 600_000);
  assert.equal(receipt.source_payload_bytes, Buffer.byteLength('<html>public local assets</html>'));
  assert.match(receipt.binary_sha256, /^[0-9a-f]{64}$/);
  const invocation = JSON.parse((await readFile(join(input.directory, 'invocations.jsonl'), 'utf8')).trim());
  assert.deepEqual(invocation.args.slice(0, 6), ['--machine', 'app', 'sorafs', 'toolkit', 'pack', input.root]);
  assert.equal(invocation.home, null);
  const files = JSON.parse(await readFile(join(input.out, 'files.json'), 'utf8'));
  assert.equal(files.files[0].path, 'index.html'); assert.equal(files.published, false);
  assert.deepEqual(JSON.parse(await readFile(join(input.out, 'local-pack.json'), 'utf8')), receipt);
  await assert.rejects(packSoraFs(input), /output already exists/);
});

test('Toolkit rejects corrupted report, alias publication, missing output and failed process', async t => {
  for (const behavior of ['bad-digest', 'alias', 'missing', 'fail']) {
    await t.test(behavior, async t => {
      const input = await fixture(t, behavior);
      await assert.rejects(packSoraFs(input));
      await assert.rejects(access(input.out), { code: 'ENOENT' });
    });
  }
});

test('native pack rejects changed inputs and symlink release files', async t => {
  const changed = await fixture(t, 'mutate');
  await assert.rejects(packSoraFs(changed), /Static build changed/);
  await assert.rejects(access(changed.out), { code: 'ENOENT' });
  const linked = await fixture(t);
  await symlink(join(linked.root, 'index.html'), join(linked.root, 'linked.html'));
  await assert.rejects(packSoraFs(linked), /symlinks/);
  await assert.rejects(access(join(linked.directory, 'invocations.jsonl')), { code: 'ENOENT' });
  await assert.rejects(packSoraFs({ ...linked, out: join(linked.root, 'nested') }), /outside/);
});

test('standalone mode preserves separate local car, manifest and provider-payload commands', async t => {
  const input = await fixture(t), receipt = await packSoraFs({ ...input, mode: 'standalone' });
  assert.equal(receipt.provider_payload_prepared, true); assert.equal(receipt.published, false);
  const calls = (await readFile(join(input.directory, 'invocations.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line).args);
  assert.deepEqual(calls.map(args => args.slice(0, 2)), [['car', 'pack'], ['manifest', 'build'], ['storage', 'prepare']]);
  assert.equal(calls[1].includes('--metadata=publication=CidOnly'), true);
  await access(join(input.out, 'sora-cars.payload.bin'));
});
