import { tmpdir } from 'node:os';
import { readNativeStreetLayout } from '../scripts/lib/street-layout-source.mjs';
import { createStreetOutputDirectory } from '../scripts/lib/street-native.ts';
import { readBoundedNativeBytes, hashBoundedNativeFile, hashBoundedNativePath, readBoundedNativeJson } from '../scripts/lib/native-file-io.mjs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, readFile, writeFile, rm, symlink, open, appendFile, stat, truncate } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import { loadStreetGeneration, streetGenerationArgument, streetArtifactHash as hash, streetPathEscapesRoot } from '../scripts/lib/street-generation.ts';

import { streetGenerationFixture as fixture } from './helpers/street-generation-fixture';

test('explicit generation admission binds every native artifact and lazy selected bundle', async () => {
  await fixture(async (root, _manifest, generation) => {
    const loaded = await loadStreetGeneration(root, generation);
    assert.deepEqual(loaded.entries.map(row => row.roster), [2, 3, 4, 5, 6, 7, 8]);
    assert.equal(loaded.provenance().bundles.length, 0);
    assert.equal((await loaded.readBundle(2)).bundle.roster, 2);
    assert.equal((await loaded.readBundle(8)).bundle.roster, 8);
    const pins = loaded.provenance();
    assert.equal(pins.binary.bytes, 6); assert.equal(pins.launcher.bytes, 8);
    assert.equal(pins.nativeSources[0]!.bytes, 6); assert.equal(pins.producers[0]!.bytes, 6);
    assert.deepEqual(pins.bundles.map(row => row.roster), [2, 8]);
    for (const pin of [pins.loader, pins.boundedIo, pins.executor, pins.generation, pins.binary, pins.launcher, ...pins.nativeSources, ...pins.producers, ...pins.bundles]) {
      const bytes = await readFile(pin.path);
      assert.equal(pin.bytes, bytes.length); assert.equal(pin.sha256, hash(bytes));
    }
    await loaded.verifyUnchanged();
  });
});

test('native CLI, launcher, native source and producer changes fail admission', async () => {
  for (const target of ['output/fresh generation/native/iroha', 'native/javascript/iroha_js/verify-pinned-native.mjs', 'native/crates/iroha_data_model/src/street_v1/layout.rs', 'scripts/fixture.ts']) await fixture(async (root, _manifest, generation) => {
    await writeFile(join(root, target), 'tampered');
    await assert.rejects(loadStreetGeneration(root, generation), /differs from generation evidence/);
  });
});

test('all admitted artifacts are checked again before accepting a result', async () => {
  for (const target of ['output/fresh generation/generation.json', 'output/fresh generation/native/iroha', 'native/javascript/iroha_js/verify-pinned-native.mjs', 'output/fresh generation/bundles/tokyo-1986-2.json', 'native/crates/iroha_data_model/src/street_v1/layout.rs', 'scripts/fixture.ts']) await fixture(async (root, _manifest, generation) => {
    const loaded = await loadStreetGeneration(root, generation); await loaded.readBundle(2);
    const path = join(root, target), bytes = await readFile(path); bytes[0] = bytes[0]! ^ 1; await writeFile(path, bytes);
    await assert.rejects(loaded.verifyUnchanged(), /Admitted artifact changed/);
  });
});

test('selected roster, node count, byte size and source inventory cannot be rebound', async () => {
  for (const field of ['roster', 'nodes', 'bytes', 'sources']) await fixture(async (root, manifest, generation) => {
    const entry = manifest.bundles[0], path = join(root, entry.path), bundle = JSON.parse(await readFile(path, 'utf8'));
    if (field === 'roster') bundle.roster = 8;
    if (field === 'nodes') entry.nodes = 2;
    if (field === 'sources') bundle.sources = { 'scripts/other.ts': hash(Buffer.from('source')) };
    const bytes = Buffer.from(JSON.stringify(bundle)); await writeFile(path, bytes);
    entry.sha256 = hash(bytes); entry.bytes = bytes.length + Number(field === 'bytes');
    await writeFile(join(root, generation), JSON.stringify(manifest));
    const loaded = await loadStreetGeneration(root, generation);
    await assert.rejects(loaded.readBundle(2), /differs/);
  });
});

test('foreign paths and missing selected binary have no fallback', async () => {
  await fixture(async (root, manifest, generation) => {
    manifest.bundles[0].path = 'output/foreign/bundle.json'; await writeFile(join(root, generation), JSON.stringify(manifest));
    await assert.rejects(loadStreetGeneration(root, generation), /escapes/);
  });
  await fixture(async (root, _manifest, generation) => {
    const selected = join(root, 'output/fresh generation/native/iroha');
    await mkdir(join(root, 'output/qualification/street-race'), { recursive: true });
    const stale = join(root, 'output/qualification/street-race/street_race_cli'); await writeFile(stale, 'binary');
    await rm(selected);
    await assert.rejects(loadStreetGeneration(root, generation), { code: 'ENOENT' });
  });
});

test('CLI requires exactly one explicit generation path including spaces', () => {
  for (const args of [[], ['file'], ['--generation'], ['--generation', ''], ['--generation', 'file', 'extra'], ['--output', 'file']]) assert.throws(() => streetGenerationArgument(args), /Use --generation/);
  assert.equal(streetGenerationArgument(['--generation', 'output/fresh generation/generation.json']), 'output/fresh generation/generation.json');
});

test('path confinement rejects Windows and POSIX parent traversal with native relative output', () => {
  for (const [paths, root, outside, inside] of [[posix, '/project/output/run', '/project/output/foreign/a', '/project/output/run/..valid/a'], [win32, 'C:\\project\\output\\run', 'C:\\project\\output\\foreign\\a', 'C:\\project\\output\\run\\..valid\\a']] as const) {
    assert.equal(streetPathEscapesRoot(paths.relative(root, outside)), true);
    assert.equal(streetPathEscapesRoot(paths.relative(root, inside)), false);
    assert.equal(streetPathEscapesRoot(paths.relative(root, root)), true);
    assert.equal(streetPathEscapesRoot(paths.relative(root, paths.dirname(root))), true);
  }
});

test('symlink substitution is rejected for selected binary', async t => {
  await fixture(async (root, _manifest, generation) => {
    const selected = join(root, 'output/fresh generation/native/iroha');
    const replacement = join(root, 'replacement'); await writeFile(replacement, 'binary'); await rm(selected);
    try { await symlink(replacement, selected); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS')) {
        t.skip(`Windows symlink privilege unavailable: ${code}`); return;
      }
      throw error;
    }
    await assert.rejects(loadStreetGeneration(root, generation), /direct file/);
  });
});

 test('retired standalone harness schema has no fallback', async () => {
  await fixture(async (root, manifest, generation) => {
    manifest.rustc = 'old'; manifest.harnessSha256 = '0'.repeat(64);
    await writeFile(join(root, generation), JSON.stringify(manifest));
    await assert.rejects(loadStreetGeneration(root, generation), /fields/);
  });
});
test('native identity, catalog and graph binding reject rewritten bundle evidence', async () => {
  for (const field of ['family', 'nativeSources', 'catalog', 'graph', 'qualification']) await fixture(async (root, manifest, generation) => {
    const entry = manifest.bundles[0], exported = JSON.parse(await readFile(join(root, entry.nativeExport.path), 'utf8'));
    if (field === 'family') exported.compilerFamilyId = '2'.repeat(64);
    if (field === 'nativeSources') exported.nativeSources = {};
    if (field === 'catalog') exported.catalog.lengthMm++;
    if (field === 'graph') exported.graph.nodes.push(1);
    if (field === 'qualification') exported.qualification.proof = true;
    const bytes = Buffer.from(JSON.stringify(exported)); await writeFile(join(root, entry.nativeExport.path), bytes);
    Object.assign(entry.nativeExport, {sha256: hash(bytes), bytes: bytes.length}); await writeFile(join(root, generation), JSON.stringify(manifest));
    const admitted = await loadStreetGeneration(root, generation);
    await assert.rejects(admitted.readBundle(2), /differs/);
  });
});

test('generator rejects symlink output ancestry before creating an external child', async t => {
  const project = await mkdtemp(join(tmpdir(), 'street-output-')), outside = await mkdtemp(join(tmpdir(), 'street-external-'));
  try {
    await mkdir(join(project, 'output'));
    try {await symlink(outside, join(project, 'output/linked'), process.platform === 'win32' ? 'junction' : 'dir');}
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOSYS'].includes(code!)) {t.skip(`Windows link unavailable: ${code}`); return;}
      throw error;
    }
    await assert.rejects(createStreetOutputDirectory(project, 'output/linked/must-not-exist'), /direct directories/);
    await assert.rejects(readFile(join(outside, 'must-not-exist')), {code: 'ENOENT'});
  } finally {await rm(project, {recursive: true, force: true}); await rm(outside, {recursive: true, force: true});}
});
test('generator creates only a fresh confined directory and preserves existing output', async () => {
  const project = await mkdtemp(join(tmpdir(), 'street-output-'));
  try {
    await assert.rejects(createStreetOutputDirectory(project, '../outside'), /child/);
    assert.equal(await createStreetOutputDirectory(project, 'output/nested/fresh'), join(await realpath(project), 'output/nested/fresh'));
    await assert.rejects(createStreetOutputDirectory(project, 'output/nested/fresh'), {code: 'EEXIST'});
  } finally {await rm(project, {recursive: true, force: true});}
});


test('maintained Node entrypoints import the TypeScript loader without a custom resolver', () => {
  for (const module of ['street-generation.ts', 'street-layout-source.mjs']) {
    const url = new URL(`../scripts/lib/${module}`, import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('loader imported');`], {
      encoding: 'utf8', timeout: 15_000, env: {...process.env, NODE_OPTIONS: ''},
    });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'loader imported');
  }
});

test('native JSON reads admit exact bounds and reject growth with bounded buffers', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'street-native-read-'))), path = join(root, 'export.json');
  try {
    await writeFile(path, '{}');
    assert.deepEqual(await readBoundedNativeJson(path, 2), {});
    await assert.rejects(readBoundedNativeJson(path, 1), /byte bound/);
    for (const bound of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) await assert.rejects(readBoundedNativeJson(path, bound), /byte bound/);
    const file = await open(path, 'r');
    try {
      const originalStat = file.stat.bind(file), originalRead = file.read.bind(file);
      t.mock.method(file, 'stat', async () => {const metadata = await originalStat(); await appendFile(path, ' '.repeat(1024)); return metadata;});
      t.mock.method(file, 'read', async (buffer: Buffer, offset: number, length: number, position: number) => {
        assert.equal(buffer.length, 3); assert.ok(length <= 3);
        return originalRead(buffer, offset, length, position);
      });
      await assert.rejects(readBoundedNativeBytes(file, 2), /changed while reading/);
    } finally {await file.close();}
  } finally {await rm(root, {recursive: true, force: true});}
});


test('generation JSON admission rejects actual growth after stat with a size-bounded allocation', async t => {
  await fixture(async (root, _manifest, generation) => {
    const path = join(root, generation), metadata = await stat(path), probe = await open(path, 'r');
    const prototype = Object.getPrototypeOf(probe), originalStat = prototype.stat, originalRead = prototype.read;
    await probe.close();
    let changed = false, selectedFd = -1, selectedReads = 0;
    t.mock.method(prototype, 'stat', async function (this: Awaited<ReturnType<typeof open>>) {
      const current = await originalStat.call(this);
      if (!changed && current.ino === metadata.ino && current.dev === metadata.dev) {
        changed = true; selectedFd = this.fd; await appendFile(path, ' '.repeat(4096));
      }
      return current;
    });
    t.mock.method(prototype, 'read', async function (this: Awaited<ReturnType<typeof open>>, buffer: Buffer, offset: number, length: number, position: number) {
      if (this.fd === selectedFd) {
        selectedReads++; assert.equal(buffer.length, metadata.size + 1); assert.ok(length <= metadata.size + 1);
      }
      return originalRead.call(this, buffer, offset, length, position);
    });
    await assert.rejects(loadStreetGeneration(root, generation), /changed while reading/);
    assert.equal(changed, true); assert.ok(selectedReads > 0);
  });
});

test('large native binary admission and every recheck hash bounded chunks, including short OS reads', async t => {
  await fixture(async (root, manifest, generation) => {
    const path = join(root, manifest.native.binary.path), bytes = Buffer.alloc(3 * 65536 + 17);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;
    await writeFile(path, bytes);
    Object.assign(manifest.native.binary, {bytes: bytes.length, sha256: hash(bytes)});
    await writeFile(join(root, generation), JSON.stringify(manifest));
    const metadata = await stat(path), probe = await open(path, 'r'), prototype = Object.getPrototypeOf(probe);
    const originalStat = prototype.stat, originalRead = prototype.read; await probe.close();
    const binaryFds = new Set<number>(); let reads = 0;
    t.mock.method(prototype, 'stat', async function (this: Awaited<ReturnType<typeof open>>) {
      const current = await originalStat.call(this);
      if (current.ino === metadata.ino && current.dev === metadata.dev) binaryFds.add(this.fd); else binaryFds.delete(this.fd);
      return current;
    });
    t.mock.method(prototype, 'read', async function (this: Awaited<ReturnType<typeof open>>, buffer: Buffer, offset: number, length: number, position: number) {
      if (binaryFds.has(this.fd)) {
        reads++; assert.ok(buffer.length <= 65536); assert.ok(length <= 65536);
        length = Math.min(length, 17003);
      }
      return originalRead.call(this, buffer, offset, length, position);
    });
    const loaded = await loadStreetGeneration(root, generation), admissionReads = reads;
    assert.ok(admissionReads > 3);
    assert.equal(loaded.provenance().binary.sha256, hash(bytes));
    await loaded.verifyUnchanged();
    assert.ok(reads > admissionReads * 2 - 1);
  });
});

test('streamed hash rejects real post-stat growth and truncation, invalid bounds, and non-files', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'street-native-hash-'))), path = join(root, 'binary');
  try {
    for (const change of ['grow', 'truncate'] as const) {
      await writeFile(path, Buffer.alloc(2 * 65536 + 17, 19));
      const file = await open(path, 'r'), originalStat = file.stat.bind(file);
      let changed = false;
      try {
        t.mock.method(file, 'stat', async () => {
          const metadata = await originalStat();
          if (!changed) { changed = true; if (change === 'grow') await appendFile(path, 'extra'); else await truncate(path, 65536); }
          return metadata;
        });
        await assert.rejects(hashBoundedNativeFile(file, 2 * 1024 * 1024 * 1024), /changed while hashing/);
      } finally { await file.close(); }
    }
    await writeFile(path, 'x');
    const file = await open(path, 'r');
    try {
      for (const limit of [0, -1, 1.5, 2 * 1024 * 1024 * 1024 + 1]) await assert.rejects(hashBoundedNativeFile(file, limit), /hash byte bound/);
      assert.deepEqual(await hashBoundedNativeFile(file, 1), {bytes: 1, sha256: hash(Buffer.from('x'))});
      await truncate(path, 0);
      await assert.rejects(hashBoundedNativeFile(file, 1), /byte bound/);
    } finally { await file.close(); }
    await assert.rejects(hashBoundedNativePath(root, 1), /byte bound|EISDIR/);
  } finally { await rm(root, {recursive: true, force: true}); }
});


test('native layout source uses the same bounded reader and rejects actual post-stat growth', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'street-layout-bound-')));
  const path = join(root, 'crates/iroha_data_model/src/street_v1/layout.rs');
  try {
    await mkdir(join(root, 'crates/iroha_data_model/src/street_v1'), {recursive: true});
    await writeFile(path, 'layout');
    const metadata = await stat(path), probe = await open(path, 'r'), prototype = Object.getPrototypeOf(probe);
    const originalStat = prototype.stat, originalRead = prototype.read; await probe.close();
    let changed = false, selectedFd = -1, selectedReads = 0;
    t.mock.method(prototype, 'stat', async function (this: Awaited<ReturnType<typeof open>>) {
      const current = await originalStat.call(this);
      if (!changed && current.ino === metadata.ino && current.dev === metadata.dev) {
        changed = true; selectedFd = this.fd; await appendFile(path, ' '.repeat(4096));
      }
      return current;
    });
    t.mock.method(prototype, 'read', async function (this: Awaited<ReturnType<typeof open>>, buffer: Buffer, offset: number, length: number, position: number) {
      if (this.fd === selectedFd) { selectedReads++; assert.equal(buffer.length, 7); assert.ok(length <= 7); }
      return originalRead.call(this, buffer, offset, length, position);
    });
    await assert.rejects(readNativeStreetLayout(root), /changed while reading/);
    assert.equal(changed, true); assert.ok(selectedReads > 0);
  } finally { await rm(root, {recursive: true, force: true}); }
});
