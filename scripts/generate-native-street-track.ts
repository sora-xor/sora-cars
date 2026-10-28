import { readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStreetTrack, streetRustTable, type AuthoredStreetTrack } from './lib/street-track-compiler';
import { compileStreetObjects, streetObjectRustTable, type AuthoredStreetObjects } from './lib/street-object-compiler';

// Authoring is offline. Consensus only reads the checked-in integer table.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const flag = args.indexOf('--iroha-root');
if (flag < 0 || !args[flag + 1] || !isAbsolute(args[flag + 1]!)) {
  throw new Error('Specify --iroha-root with an absolute native checkout path.');
}
const expected = new Set([flag, flag + 1, ...args.flatMap((arg, i) => arg === '--check' ? [i] : [])]);
if (expected.size !== args.length || args.filter(arg => arg === '--check').length > 1) {
  throw new Error('Unexpected generation arguments.');
}
const native = await realpath(args[flag + 1]!);
await readFile(resolve(native, 'Cargo.toml'));
const sources = [
  'scripts/generate-native-street-track.ts',
  'scripts/lib/street-track-compiler.ts',
  'scripts/lib/street-object-compiler.ts',
  'src/game/street/objects.ts',
  'src/game/street/track.ts',
  'world/authoring/tokyo-1986.json',
  'world/authoring/tokyo-1986.objects.json',
];
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inputs = Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(resolve(root, path)))])));
const track = compileStreetTrack(JSON.parse(await readFile(resolve(root, sources[5]!), 'utf8')) as AuthoredStreetTrack);
const objects = compileStreetObjects(track, JSON.parse(await readFile(resolve(root, sources[6]!), 'utf8')) as AuthoredStreetObjects);
if (track.id !== 'tokyo-1986') throw new Error('This generator owns only the closed Tokyo 1986 member.');
const rust = ('// Generated offline by sora-cars/scripts/generate-native-street-track.ts.\n'
  + '// Exact integer catalog; this does not establish surveyed historical accuracy or proof qualification.\n'
  + streetRustTable(track) + '\n' + streetObjectRustTable(objects, track))
  .replaceAll('crate::geometry', 'crate::execution_proofs::street_v1::compiler::geometry')
  .replaceAll('crate::hazards', 'crate::execution_proofs::street_v1::compiler::hazards')
  .replace(/\bpub /g, 'pub(super) ');
const provenance = JSON.stringify({ version: 1, track: track.id, inputs,
  compiledTrackSha256: hash(JSON.stringify(track) + '\n'),
  compiledObjectsSha256: hash(JSON.stringify(objects) + '\n'),
  generatedRustSha256: hash(rust), samples: track.samples.length, gates: track.gates.length,
  hazards: objects.objects.length, lengthMm: track.lengthMm, laps: track.laps, maxTicks: track.maxTicks,
  historicalAlignmentQualified: false, executionProfileRegistered: false }, null, 2) + '\n';
const folder = resolve(native, 'crates/iroha_core/src/execution_proofs/street_v1/compiler');
for (const [name, bytes] of [['tokyo_1986.rs', rust], ['TRACK_PROVENANCE.json', provenance]] as const) {
  const path = resolve(folder, name);
  if (args.includes('--check')) {
    if (await readFile(path, 'utf8') !== bytes) throw new Error(`Generated native catalog differs: ${name}`);
  } else await writeFile(path, bytes);
}
console.log(`${args.includes('--check') ? 'Checked' : 'Generated'} native Tokyo catalog: ${track.samples.length} road rows, ${objects.objects.length} objects.`);
