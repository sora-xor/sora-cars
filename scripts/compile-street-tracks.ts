import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { compileStreetTrack, streetRustTable, type AuthoredStreetTrack } from './lib/street-track-compiler';

const [input = 'world/authoring/tokyo-1986.json', destination = 'output/street-tracks'] = process.argv.slice(2);
const bytes = await readFile(input);
const source = JSON.parse(bytes.toString('utf8')) as AuthoredStreetTrack;
const track = compileStreetTrack(source);
const audioBytes = await readFile(resolve('world/audio', track.sound.asset));
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
if (hash(audioBytes) !== track.sound.sha256) throw new Error('Soundtrack differs from the authored digest.');
const json = JSON.stringify(track) + '\n', rust = streetRustTable(track);
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, `${track.id}.json`), json);
await writeFile(resolve(destination, `${track.id}.rs`), rust);
await writeFile(resolve(destination, `${track.id}.manifest.json`), JSON.stringify({ version: 1, id: track.id,
  authoringSha256: hash(bytes), compiledSha256: hash(json), rustSha256: hash(rust), soundSha256: track.sound.sha256,
  lengthMm: track.lengthMm, laps: track.laps, targetMs: track.targetMs, maxTicks: track.maxTicks,
  averageTargetKmh: Number((track.lengthMm * track.laps * 3.6 / track.targetMs).toFixed(2)),
  samples: track.samples.length, gates: track.gates.length, qualification: track.qualification }, null, 2) + '\n');
console.log(`Compiled ${track.id}: ${(track.lengthMm / 1e6).toFixed(3)} km × ${track.laps}, ${track.samples.length} samples, ${track.gates.length} ordered gates. Native and historic-alignment qualification remain false.`);
