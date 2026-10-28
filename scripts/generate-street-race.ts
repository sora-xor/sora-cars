import { createHash } from 'node:crypto';
import { writeFile, mkdir, copyFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { compileStreetTrack, type AuthoredStreetTrack } from './lib/street-track-compiler';
import { compileStreetObjects, type AuthoredStreetObjects } from './lib/street-object-compiler';
import { STREET_LAYOUT_COPY, STREET_LAYOUT_METADATA, STREET_LAYOUT_BROWSER, verifyStreetLayout } from './lib/street-layout-source.mjs';
import { withStreetNative, STREET_NATIVE_LAUNCHER, createStreetOutputDirectory } from './lib/street-native';
import { readBoundedNativeFile, readBoundedNativeJson, hashBoundedNativePath } from './lib/native-file-io.mjs';
import { streetPathEscapesRoot } from './lib/street-generation';
import type { StreetRaceBundle } from '../src/game/street/session';

const args = process.argv.slice(2), flags = ['--output', '--iroha-root', '--native-binary', '--native-sha256'];
if (args.length !== 8 || flags.some(flag => args.filter(value => value === flag).length !== 1)
    || args.some((value, i) => i % 2 === 0 ? !flags.includes(value) : !value)) throw new Error('Use --output <fresh child of output/> --iroha-root <absolute checkout> --native-binary <absolute iroha> --native-sha256 <trusted executable SHA-256>.');
const selected = Object.fromEntries(flags.map(flag => [flag, args[args.indexOf(flag) + 1]!]));
if (!isAbsolute(selected['--iroha-root']!) || !isAbsolute(selected['--native-binary']!) || !/^[0-9a-f]{64}$/.test(selected['--native-sha256']!)) throw new Error('Explicit absolute native paths and an independently pinned executable hash are required.');
const output = resolve(selected['--output']!), root = await realpath(selected['--iroha-root']!);
if (streetPathEscapesRoot(relative(resolve('output'), output))) throw new Error('Street generation must use a child directory of output/.');
await verifyStreetLayout(root);
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['scripts/generate-street-race.ts', 'scripts/lib/street-native.ts', 'scripts/lib/street-generation.ts',
  'scripts/lib/native-file-io.mjs', 'scripts/lib/native-file-io.d.mts',
  'scripts/lib/street-track-compiler.ts', 'scripts/lib/street-object-compiler.ts', 'src/game/street/objects.ts',
  'world/authoring/tokyo-1986.json', 'world/authoring/tokyo-1986.objects.json', STREET_LAYOUT_COPY, STREET_LAYOUT_METADATA, STREET_LAYOUT_BROWSER,
  'scripts/lib/street-layout-source.mjs', 'scripts/lib/street-layout-source.d.mts'];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, (await hashBoundedNativePath(path, 16 * 1024 ** 2)).sha256])));
const track = compileStreetTrack(await readBoundedNativeJson('world/authoring/tokyo-1986.json') as AuthoredStreetTrack);
const catalog = compileStreetObjects(track, await readBoundedNativeJson('world/authoring/tokyo-1986.objects.json') as AuthoredStreetObjects);
await createStreetOutputDirectory(process.cwd(), output);
await mkdir(resolve(output, 'bundles'));
await mkdir(resolve(output, 'native'));
const binary = resolve(output, 'native', process.platform === 'win32' ? 'iroha.exe' : 'iroha');
const launcherPin = await hashBoundedNativePath(resolve(root, STREET_NATIVE_LAUNCHER), 1024 ** 2);
const native = { physicalSourceRoot: root, binary: { path: relative(resolve('.'), binary), bytes: 0, sha256: selected['--native-sha256']! },
  launcher: { key: STREET_NATIVE_LAUNCHER, ...launcherPin }, compilerFamilyId: '', sources: {} as Record<string, string> };
const bundles: {path: string; roster: number; sha256: string; bytes: number; nodes: number; nativeExport: {path: string; sha256: string; bytes: number}}[] = [];
await withStreetNative(root, selected['--native-binary']!, native.binary.sha256, async (execute, capturedPath) => {
  await copyFile(capturedPath, binary);
  const retainedBinary = await hashBoundedNativePath(binary, 2 * 1024 ** 3);
  if (retainedBinary.sha256 !== native.binary.sha256) throw new Error('Retained native binary differs from its independent pin.');
  native.binary.bytes = retainedBinary.bytes;
  for (const roster of [2, 3, 4, 5, 6, 7, 8]) {
    const exportPath = resolve(output, `native-motion-${roster}.json`);
    execute(['export-street-motion', '--roster', String(roster), '--output-file', exportPath]);
    const exported = await readBoundedNativeFile(exportPath);
    const value = JSON.parse(exported.toString());
    if (value.version !== 1 || value.domain !== 'iroha.street-motion-export.v1' || value.roster !== roster
        || !/^hash:[0-9A-F]{64}#[0-9A-F]{4}$/.test(value.compilerFamilyId) || !value.nativeSources || typeof value.nativeSources !== 'object'
        || Object.values(value.qualification).some(flag => flag !== false)) throw new Error('Invalid native motion export.');
    if (roster === 2) { native.compilerFamilyId = value.compilerFamilyId; native.sources = value.nativeSources; }
    if (value.compilerFamilyId !== native.compilerFamilyId || JSON.stringify(value.nativeSources) !== JSON.stringify(native.sources)) throw new Error('Native source identity changed between rosters.');
    const expected = { track: track.id, topology: track.topology, lengthMm: track.lengthMm, maxTicks: track.maxTicks, laps: track.laps,
      road: track.samples.map(p => [p.progressMm, p.eastMm, p.northMm, p.elevationMm, p.halfWidthMm, p.headingMicroturn, p.turnPerMetre, p.sector]),
      gates: track.gates.map(g => g.sample), objects: catalog.objects.map(({ kind, progressMm, lateralMm, halfLengthMm, halfWidthMm }) => ({ kind, progressMm, lateralMm, halfLengthMm, halfWidthMm })) };
    for (const [key, expectedValue] of Object.entries(expected)) {
      const canonical = (v: unknown): string => JSON.stringify(v, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort()) : item);
      if (canonical(value.catalog[key]) !== canonical(expectedValue)) throw new Error(`Authored presentation disagrees with fixed native catalog: ${key}`);
    }
    const bundle: StreetRaceBundle = { version: 1, domain: 'sora-cars.street-race-draft.v1', roster, track, objects: catalog.objects,
      graph: value.graph, initialInputs: value.initialInputs, initialOutputs: value.initialOutputs, sources,
      qualification: { proof: false, consensus: false, playability: false } };
    const bytes = JSON.stringify(bundle) + '\n', path = relative(resolve('.'), resolve(output, 'bundles', `${track.id}-${roster}.json`));
    await writeFile(path, bytes, { flag: 'wx' });
    bundles.push({ path, roster, sha256: hash(bytes), bytes: Buffer.byteLength(bytes), nodes: bundle.graph.nodes.length,
      nativeExport: { path: relative(resolve('.'), exportPath), sha256: hash(exported), bytes: exported.length } });
  }
});
for (const [key, expected] of Object.entries(native.sources)) {
  if (!/^crates\/[A-Za-z0-9_./-]+$/.test(key) || key.split('/').some(p => p === '..' || p === '.')) throw new Error('Invalid native source key.');
  const path = resolve(root, key);
  if ((await hashBoundedNativePath(path, 16 * 1024 ** 2)).sha256 !== expected) throw new Error(`Selected native source differs from compiled export: ${key}`);
}
for (const [path, expected] of Object.entries(sources)) if ((await hashBoundedNativePath(path, 16 * 1024 ** 2)).sha256 !== expected) throw new Error(`App source changed during export: ${path}`);
if ((await hashBoundedNativePath(resolve(root, STREET_NATIVE_LAUNCHER), 1024 ** 2)).sha256 !== native.launcher.sha256) throw new Error('Native launcher changed during export.');
await writeFile(resolve(output, 'generation.json'), JSON.stringify({ version: 1, domain: 'sora-cars.native-street-generation.v1', sources, native, bundles,
  qualification: { proof: false, ledger: false, playability: false } }, null, 2) + '\n', { flag: 'wx' });
console.log(`Exported native Street motion graphs for rosters 2–8: ${native.compilerFamilyId}. Arithmetic only; no proof or ledger qualification.`);
