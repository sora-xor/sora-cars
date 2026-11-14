import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { MUSIC_ITEMS, MUSIC_LICENSE } from '../src/game/music-catalog';
import { STORY_ANGLE_ART, STORY_BEAT_ART, STORY_CUT_ART, STORY_SCENES } from '../src/game/story-scenes';
import { CHAPTERS } from '../src/game/story';
import { optimizedDrivingAssets } from '../src/game/three/optimized-driving-assets';
import { optimizedStartupAssets } from '../src/startup-assets';
import archive from '../src/archived-assets.generated.json';

// Produce a separate release directory. No public/source/build file is modified or removed.
// Conservative pruning: every unclassified asset stays; only superseded driving variants,
// unused story variants and development artifacts are omitted. Full music downloads stay.
const [inputArg, outputArg, maximumArg, archiveFlag] = process.argv.slice(2);
assert.ok(inputArg && outputArg, 'Usage: node --import tsx scripts/prepare-runtime-release.ts <built-dist> <new-output-directory> [maximum-payload-bytes] [--reuse-archive]');
assert.ok(archiveFlag === undefined || archiveFlag === '--reuse-archive', 'unknown archive mode');
const reuseArchive = archiveFlag === '--reuse-archive';
const input = resolve(inputArg), output = resolve(outputArg);
assert.ok(output !== input && !output.startsWith(input + sep) && !input.startsWith(output + sep), 'input and output must be separate');
await lstat(output).then(() => { throw new Error('output already exists; use a new directory'); }, (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), `release input contains a symlink: ${entry.name}`);
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`release input contains a non-file: ${path}`);
  }
  return result.sort();
}
const story = new Set([
  ...CHAPTERS.map(chapter => chapter.art),
  ...Object.values(STORY_SCENES).map(value => value.art),
  ...Object.values(STORY_ANGLE_ART).flatMap(value => Object.values(value)),
  ...Object.values(STORY_BEAT_ART),
  ...Object.values(STORY_CUT_ART).flat(),
]);
// Explicit portrait and loading-cover references supplement the generated story tables.
for (const source of ['src/ui/story-portraits.ts', 'src/ui/scene-preparation.ts']) {
  const text = await readFile(source, 'utf8');
  for (const match of text.matchAll(/['"]((?:assets\/story\/)?(?:angles\/)?[a-z0-9-]+\.png)['"]/g)) {
    const name = match[1]!.replace(/^assets\/story\//, '');
    story.add(name.startsWith('angles/') ? name : `angles/${name}`);
  }
}
const music = new Map<string, { bytes?: number; sha256: string }>();
for (const item of MUSIC_ITEMS) {
  assert.ok(item.assets && item.artwork, `missing catalog media: ${item.sku}`);
  for (const file of [item.assets.wav, item.assets.mp3, item.assets.preview, item.artwork]) music.set(file.path, file);
}
music.set(MUSIC_LICENSE.path, MUSIC_LICENSE);
const inputFiles = await files(input);
const entryHtml = await readFile(resolve(input, 'index.html'), 'utf8');
const entryBundles = new Set([...entryHtml.matchAll(/(?:src|href)="\.\/(assets\/index-[^"]+\.(?:js|css))"/g)].map(match => match[1]));
assert.ok([...entryBundles].some(path => path?.endsWith('.js')), 'cannot identify the frozen JavaScript entrypoint');
const sourceNames = new Set(inputFiles.map(file => relative(input, file).split(sep).join('/')));
for (const [path, pin] of music) {
  const bytes = await readFile(resolve(input, path));
  assert.ok((pin.bytes === undefined || bytes.length === pin.bytes) && sha(bytes) === pin.sha256, `catalog hash mismatch: ${path}`);
}
for (const name of story) assert.ok(sourceNames.has(`assets/story/${name}`), `missing runtime story image: ${name}`);
for (const destination of Object.values(optimizedDrivingAssets)) assert.ok(sourceNames.has(`assets/${destination}`), `missing optimized driving asset: ${destination}`);
for (const destination of Object.values(optimizedStartupAssets)) assert.ok(sourceNames.has(destination), `missing lossless startup asset: ${destination}`);
const excluded: { path: string; bytes: number; sha256: string; reason: string }[] = [];
const included: { path: string; bytes: number; sha256: string }[] = [];
if (reuseArchive) {
  const javascript = await Promise.all(inputFiles.filter(path => path.endsWith('.js')).map(path => readFile(path, 'utf8')));
  assert.ok(javascript.some(text => text.includes(archive.origin)), 'build does not contain the explicit retained publication; build with VITE_SORA_CARS_REUSE_ARCHIVE=1');
}
for (const file of inputFiles) {
  const path = relative(input, file).split(sep).join('/');
  const bytes = await readFile(file), entry = { path, bytes: bytes.length, sha256: sha(bytes) };
  let reason = '';
  const pinnedArchive = (archive.files as Record<string, { bytes: number; sha256: string }>)[path];
  if (reuseArchive && pinnedArchive) {
    assert.ok(entry.bytes === pinnedArchive.bytes && entry.sha256 === pinnedArchive.sha256, `retained publication bytes changed: ${path}`);
    reason = `explicit immutable asset URL ${archive.origin}/${path}; original bytes and hash retained`;
  } else if (path.endsWith('.map')) reason = 'development source map; application entrypoints do not request it';
  else if (/^assets\/index-[^/]+\.(?:js|css)$/.test(path) && !entryBundles.has(path)) reason = 'orphaned prior build entrypoint; not referenced by the frozen index.html';
  else if (optimizedStartupAssets[path]) reason = `lossless runtime replacement ${optimizedStartupAssets[path]}; source bytes and licenses retained`;
  else if (path === 'assets/models/roadside/mature-tree/source/tree_small_02.bin'
    || /^assets\/models\/roadside\/mature-tree\/mature-tree-lod[01]\.(?:bin|gltf)$/.test(path)
    || /^assets\/models\/(?:roadside\/pine|sora-coupe)\//.test(path) && !/\.(?:txt|md)$/i.test(path)) reason = 'retained authoring/unused model variant; production scene uses optimized AE86 and mature-tree LOD2/3; originals remain in source and the previous publication';
  else if (path.startsWith('assets/') && optimizedDrivingAssets[path.slice(7)]) reason = `runtime URL maps to assets/${optimizedDrivingAssets[path.slice(7)]}`;
  else if (path.startsWith('assets/story/') && /\.(?:png|jpg|webp)$/.test(path) && !story.has(path.slice('assets/story/'.length))) reason = 'story image is absent from runtime scene, cut, beat, portrait and loading-cover tables';
  else if (path === 'assets/models/architecture-ambient/geometry.bin') reason = 'runtime loads the lossless geometry.bin.gz variant and verifies the decoded original hash';
  else if (path === 'assets/fonts/noto-sans-jp.ttf') reason = 'application CSS uses the complete lossless WOFF2 variant; TTF is retained in source for authoring tools';
  if (reason) excluded.push({ ...entry, reason }); else included.push(entry);
}
const total = included.reduce((sum, entry) => sum + entry.bytes, 0);
const report = { schema: 'sora-cars.runtime-release-inventory.v1', input, output, sourceFilesPreserved: true, retainedAssetOrigin: reuseArchive ? archive.origin : null, retainedAssetManifestSha256: sha(await readFile('src/archived-assets.generated.json')), catalogFilesVerified: music.size, payloadBytes: total, excludedBytes: excluded.reduce((sum, entry) => sum + entry.bytes, 0), included, excluded };
// A failed budget leaves only a reviewable inventory beside the requested directory.
await mkdir(dirname(output), { recursive: true });
await writeFile(`${output}.inventory.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
if (maximumArg) assert.ok(Number.isSafeInteger(Number(maximumArg)) && total <= Number(maximumArg), `runtime payload ${total} exceeds budget ${maximumArg}; full feature assets were preserved`);
await mkdir(output);
for (const entry of included) {
  const target = resolve(output, entry.path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(input, entry.path), target, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
  assert.equal(sha(await readFile(target)), entry.sha256, `release copy differs: ${entry.path}`);
}
console.log(JSON.stringify({ output, inventory: `${output}.inventory.json`, payloadBytes: total, excludedBytes: report.excludedBytes, files: included.length, catalogFilesVerified: music.size }));
