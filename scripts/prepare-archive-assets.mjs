import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// This CID is the already published, retained native SoraFS release. Only identical files
// are eligible; new or changed artwork/recordings always remain in the new release.
const origin = 'https://bafyr6ihjtvfsyx5nieck2hieoofa677c62drdrmhsoskvphpvpzstnjlf4.sorafs.taira.sora.org';
const original = resolve(process.argv[2] ?? 'output/reviews/sorafs-publish-20261107/app/release/dist');
const current = resolve('public');
async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), `archive candidate is a symlink: ${entry.name}`);
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
const archived = {};
for (const group of ['assets/music', 'assets/story']) for (const file of await files(resolve(current, group))) {
  const path = relative(current, file), bytes = await readFile(file);
  if (group === 'assets/music' && !/\.(wav|mp3|png)$/.test(path) && path !== 'assets/music/sora-music-license-v1.txt') continue;
  const previous = await readFile(resolve(original, path)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (previous?.equals(bytes)) archived[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const result = { schema: 'sora-cars.retained-native-assets.v1', origin, files: archived };
await writeFile('src/archived-assets.generated.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ files: Object.keys(archived).length, retainedBytes: Object.values(archived).reduce((sum, file) => sum + file.bytes, 0), origin }));
