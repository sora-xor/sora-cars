import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

// Freeze a self-contained replacement and preserve every byte of the superseded
// publication. This operates on public build directories only; it never publishes.
const [builtArg, originalArg, outputArg, maximumArg] = process.argv.slice(2);
assert.ok(builtArg && originalArg && outputArg && maximumArg,
  'Usage: node scripts/prepare-preserved-release.mjs <built-dist> <original-dist> <new-output> <maximum-bytes>');
const built = resolve(builtArg), original = resolve(originalArg), output = resolve(outputArg);
const maximum = Number(maximumArg);
assert.ok(Number.isSafeInteger(maximum) && maximum > 0);
for (const source of [built, original]) assert.ok(output !== source && !output.startsWith(source + sep) && !source.startsWith(output + sep));
await lstat(output).then(() => { throw new Error('Output already exists; choose a new directory'); }, error => { if (error.code !== 'ENOENT') throw error; });
async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function inventory(root, prefix = '') {
  const rows = [];
  for (const entry of (await readdir(resolve(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    assert.ok(!entry.isSymbolicLink(), `Symlink in source: ${prefix}${entry.name}`);
    const path = `${prefix}${entry.name}`, absolute = resolve(root, path);
    if (entry.isDirectory()) rows.push(...await inventory(root, `${path}/`));
    else {
      assert.ok(entry.isFile(), `Non-file in source: ${path}`);
      rows.push({ path, bytes: (await lstat(absolute)).size, sha256: await digest(absolute) });
    }
  }
  return rows;
}
const current = await inventory(built), previous = await inventory(original);
assert.ok(current.some(row => row.path === 'index.html') && previous.some(row => row.path === 'index.html'));
assert.ok(!current.some(row => row.path.startsWith('retained-original/')), 'Reserved preservation namespace already exists');
const present = new Map(current.map(row => [row.path, row]));
const copies = current.map(row => ({ ...row, source: resolve(built, row.path) }));
const retained = previous.map(row => {
  const samePath = present.get(row.path);
  const identical = samePath?.bytes === row.bytes && samePath.sha256 === row.sha256;
  const destination = !samePath || identical ? row.path : `retained-original/${row.path}`;
  if (!identical) copies.push({ ...row, path: destination, source: resolve(original, row.path) });
  return { ...row, destination };
});
const preservation = { schema: 'sora-cars.preserved-publication.v1', originalFiles: previous.length,
  originalBytes: previous.reduce((sum, row) => sum + row.bytes, 0), files: retained };
const metadata = Buffer.from(JSON.stringify(preservation, null, 2) + '\n');
const metadataPath = 'retained-original/file-map.json';
assert.ok(!copies.some(row => row.path === metadataPath));
const total = copies.reduce((sum, row) => sum + row.bytes, metadata.length);
assert.ok(total <= maximum, `Complete preserved release ${total} exceeds ${maximum}`);
assert.equal(new Set(copies.map(row => row.path)).size, copies.length, 'Output paths overlap');
await mkdir(output, { recursive: false });
for (const row of copies) {
  const target = resolve(output, row.path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(row.source, target, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
  assert.equal(await digest(target), row.sha256, `Copy differs: ${row.path}`);
}
await mkdir(resolve(output, 'retained-original'), { recursive: true });
await writeFile(resolve(output, metadataPath), metadata, { flag: 'wx' });
assert.deepEqual(await inventory(built), current, 'Build changed while freezing');
assert.deepEqual(await inventory(original), previous, 'Original publication changed while freezing');
const included = await inventory(output);
assert.equal(included.reduce((sum, row) => sum + row.bytes, 0), total);
const report = { schema: 'sora-cars.complete-preserved-release.v1', built, original, output,
  payloadBytes: total, maximumPayloadBytes: maximum, files: included.length,
  originalFilesPreserved: previous.length, originalBytesPreserved: preservation.originalBytes,
  externalArchiveRequired: false, included, originalMapping: retained };
await writeFile(`${output}.inventory.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
// Verify the public preservation map itself remains readable and unmodified.
assert.deepEqual(JSON.parse(await readFile(resolve(output, metadataPath), 'utf8')), preservation);
console.log(JSON.stringify({ output, inventory: `${output}.inventory.json`, payloadBytes: total,
  files: included.length, originalFilesPreserved: previous.length, originalBytesPreserved: preservation.originalBytes }));
