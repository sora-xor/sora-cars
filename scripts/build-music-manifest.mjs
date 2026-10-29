import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUSIC_LIBRARY } from '../src/game/music-score.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(path.join(root, 'public/assets/music/audio/manifest.json'), 'utf8'));
const supplied = JSON.parse(await readFile(path.join(root, 'src/game/music-supplied-recordings.json'), 'utf8'));
const expected = [...MUSIC_LIBRARY, ...supplied].map(song => song.file);
if (!Array.isArray(manifest.tracks) || manifest.tracks.length !== expected.length || manifest.tracks.some((track, index) => track.file !== expected[index])) throw new Error('All current score and supplied recordings are required in catalog order.');
const assets = {};
for (const track of manifest.tracks) {
  if (!/^[a-z0-9-]+$/.test(track.file) || assets[track.file]) throw new Error('Invalid or duplicate song.');
  const suppliedSong = supplied.find(song => song.file === track.file);
  if (suppliedSong && (track.provenance?.kind !== 'supplied-lossy-recording' || JSON.stringify(track.provenance.source) !== JSON.stringify(suppliedSong.source))) throw new Error(`Supplied recording provenance: ${track.file}`);
  if (suppliedSong && sha(await readFile(path.join(root, suppliedSong.source.path))) !== suppliedSong.source.sha256) throw new Error(`Supplied recording source integrity: ${track.file}`);
  const files = {};
  for (const format of ['wav', 'mp3', 'preview']) {
    const raw = track[format];
    const file = raw && { path: raw.path.replace(/^\//, ''), bytes: raw.bytes, sha256: raw.sha256 };
    files[format] = file;
    if (!file || !file.path.startsWith('assets/music/audio/') || file.path.includes('..')) throw new Error(`Invalid ${format} path.`);
    const bytes = await readFile(path.join(root, 'public', file.path));
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`Audio integrity: ${track.file}/${format}`);
  }
  // 表 (OMOTE) keeps the original sleeve; 裏 (URA) is the back-jacket edition.
  const covers = {};
  for (const [key, version] of [['cover', 'v1'], ['coverUra', 'v2']]) {
    const coverPath = `assets/music/covers/${track.file}-${version}.png`, cover = await readFile(path.join(root, 'public', coverPath));
    if (cover.subarray(1, 4).toString() !== 'PNG' || cover.readUInt32BE(16) < 1024 || cover.readUInt32BE(20) < 1024) throw new Error(`Cover dimensions: ${track.file} ${version}`);
    covers[key] = { path: coverPath, bytes: cover.length, sha256: sha(cover) };
  }
  if (covers.cover.sha256 === covers.coverUra.sha256) throw new Error(`表 and 裏 sleeves must differ: ${track.file}`);
  assets[track.file] = { ...files, ...covers, durationSeconds: track.durationSeconds, ...(track.provenance ? { provenance: track.provenance } : {}) };
}
const output = path.join(root, 'src/game/music-assets.generated.json');
await writeFile(output, JSON.stringify(assets, null, 2) + '\n');
console.log(JSON.stringify({ tracks: Object.keys(assets).length, assets: Object.keys(assets).length * 5, output, bytes: (await stat(output)).size }));
