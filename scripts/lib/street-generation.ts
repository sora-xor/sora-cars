import { createHash } from 'node:crypto';
import { realpath, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withStreetNative, STREET_NATIVE_LAUNCHER, streetNativeModulePath } from './street-native.ts';
import { readBoundedNativeFile as readDirect, hashBoundedNativePath as hashDirect, readBoundedNativeJson, nativeFileModulePath } from './native-file-io.mjs';
import type { StreetRaceBundle } from '../../src/game/street/session';

export const streetArtifactHash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const MiB = 1024 * 1024;
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[], label: string) {
  if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`Invalid ${label} fields.`);
}
// Accept both native path separators so confinement remains explicit on Windows.
export const streetPathEscapesRoot = (tail: string) => !tail || /^\.\.(?:[\\/]|$)/.test(tail) || isAbsolute(tail);
function child(root: string, path: string) {
  const resolved = resolve(root, path), tail = relative(root, resolved);
  if (streetPathEscapesRoot(tail)) throw new Error('Artifact path escapes its root.');
  return resolved;
}
function sourceInventory(value: unknown): Record<string, string> {
  const entries = record(value, 'producer inventory');
  if (!Object.keys(entries).length) throw new Error('Empty producer inventory.');
  for (const [path, expected] of Object.entries(entries)) {
    if (!/^(world|scripts|src)\/[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..') || !digest(expected)) throw new Error('Invalid producer inventory.');
  }
  return entries as Record<string, string>;
}
export function streetGenerationArgument(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--generation' || !args[1]) throw new Error('Use --generation output/<fresh-generation>/generation.json.');
  return args[1];
}
export interface StreetArtifactPin { path: string; bytes: number; sha256: string }

/** Admit explicit local generation evidence; this supplies no proof or ledger authority. */
export async function loadStreetGeneration(projectRoot: string, generationFile: string) {
  const root = await realpath(projectRoot);
  const manifestPath = child(resolve(root, 'output'), resolve(root, generationFile));
  const directory = dirname(manifestPath);
  const pins = new Map<string, StreetArtifactPin>();
  async function admit(path: string, limit: number, expected?: string, expectedBytes?: number, label = 'Artifact') {
    const bytes = await readDirect(path, limit), sha256 = streetArtifactHash(bytes);
    if ((expected !== undefined && sha256 !== expected) || (expectedBytes !== undefined && bytes.length !== expectedBytes)) throw new Error(`${label} differs from generation evidence: ${path}`);
    pins.set(path, { path, bytes: bytes.length, sha256 });
    return bytes;
  }
  const loaderPath = fileURLToPath(import.meta.url);
  await admit(loaderPath, 16 * MiB);
  await admit(streetNativeModulePath, 16 * MiB);
  await admit(nativeFileModulePath, 16 * MiB);
  const manifestBytes = await admit(manifestPath, MiB);
  const manifest = record(JSON.parse(manifestBytes.toString()), 'generation manifest');
  exact(manifest, ['version', 'domain', 'sources', 'native', 'bundles', 'qualification'], 'generation manifest');
  const sources = sourceInventory(manifest.sources);
  const native = record(manifest.native, 'native producer');
  exact(native, ['physicalSourceRoot', 'binary', 'launcher', 'compilerFamilyId', 'sources'], 'native producer');
  const binary = record(native.binary, 'native binary'), launcher = record(native.launcher, 'native launcher');
  exact(binary, ['path', 'sha256', 'bytes'], 'native binary'); exact(launcher, ['key', 'sha256', 'bytes'], 'native launcher');
  const nativeSources = record(native.sources, 'native source inventory');
  if (!Object.keys(nativeSources).length || Object.entries(nativeSources).some(([key, value]) => !/^crates\/[A-Za-z0-9_./-]+$/.test(key) || key.split('/').some(p => !p || p === '.' || p === '..') || !digest(value))) throw new Error('Invalid native source inventory.');
  const qualification = record(manifest.qualification, 'qualification');
  exact(qualification, ['proof', 'ledger', 'playability'], 'qualification');
  if (manifest.version !== 1 || manifest.domain !== 'sora-cars.native-street-generation.v1'
      || typeof native.physicalSourceRoot !== 'string' || !isAbsolute(native.physicalSourceRoot) || typeof native.compilerFamilyId !== 'string' || !/^hash:[0-9A-F]{64}#[0-9A-F]{4}$/.test(native.compilerFamilyId)
      || typeof binary.path !== 'string' || !digest(binary.sha256) || !positive(binary.bytes) || binary.bytes > 2 * 1024 * MiB
      || launcher.key !== STREET_NATIVE_LAUNCHER || !digest(launcher.sha256) || !positive(launcher.bytes)
      || Object.values(qualification).some(value => value !== false)) throw new Error('Invalid generation manifest.');
  if (!Array.isArray(manifest.bundles) || manifest.bundles.length !== 7) throw new Error('Expected complete two-to-eight-car generation inventory.');
  const rosters = new Set<number>();
  const entries = manifest.bundles.map(value => {
    const row = record(value, 'bundle inventory');
    exact(row, ['path', 'sha256', 'bytes', 'roster', 'nodes', 'nativeExport'], 'bundle inventory');
    if (typeof row.path !== 'string' || isAbsolute(row.path) || !row.path.startsWith('output/') || row.path.split('/').some(p => !p || p === '.' || p === '..') || !digest(row.sha256) || !positive(row.bytes) || row.bytes > 32 * MiB || !positive(row.nodes)
        || !positive(row.roster) || row.roster < 2 || row.roster > 8 || rosters.has(row.roster)) throw new Error('Invalid bundle inventory.');
    const exported = record(row.nativeExport, 'native export');
    exact(exported, ['path', 'sha256', 'bytes'], 'native export');
    if (typeof exported.path !== 'string' || !digest(exported.sha256) || !positive(exported.bytes) || exported.bytes > 32 * MiB) throw new Error('Invalid native export.');
    rosters.add(row.roster);
    return { path: child(directory, resolve(root, row.path)), sha256: row.sha256, bytes: row.bytes, roster: row.roster, nodes: row.nodes, nativeExport: {path: child(directory, resolve(root, exported.path)), sha256: exported.sha256, bytes: exported.bytes} };
  }).sort((a, b) => a.roster - b.roster);
  const binaryPath = child(directory, resolve(root, binary.path));
  const binaryPin = await hashDirect(binaryPath, 2 * 1024 * MiB);
  if (binaryPin.bytes !== binary.bytes || binaryPin.sha256 !== binary.sha256) throw new Error(`Native CLI differs from generation evidence: ${binaryPath}`);
  pins.set(binaryPath, {path: binaryPath, ...binaryPin});
  for (const [path, expected] of Object.entries(sources)) await admit(child(root, path), 16 * MiB, expected, undefined, 'Producer');
  const nativeRoot = await realpath(native.physicalSourceRoot);
  const launcherPath = child(nativeRoot, STREET_NATIVE_LAUNCHER);
  await admit(launcherPath, MiB, launcher.sha256, launcher.bytes, 'Native artifact launcher');
  for (const [key, expected] of Object.entries(nativeSources)) await admit(child(nativeRoot, key), 16 * MiB, expected as string, undefined, 'Selected native source');
  const cached = new Map<number, { bytes: Buffer; bundle: StreetRaceBundle }>();
  async function readBundle(roster: number) {
    const cachedValue = cached.get(roster);
    if (cachedValue) return cachedValue;
    const entry = entries.find(row => row.roster === roster);
    if (!entry) throw new Error('Unsupported Street roster.');
    const bytes = await admit(entry.path, entry.bytes, entry.sha256, entry.bytes, 'Native bundle');
    const data = record(JSON.parse(bytes.toString()), 'Street bundle');
    const bundleSources = sourceInventory(data.sources);
    const graph = record(data.graph, 'Street graph');
    if (data.version !== 1 || data.domain !== 'sora-cars.street-race-draft.v1' || data.roster !== roster || record(data.track, 'Street track').id !== 'tokyo-1986'
        || !Array.isArray(graph.nodes) || graph.nodes.length !== entry.nodes
        || Object.keys(bundleSources).length !== Object.keys(sources).length || Object.entries(sources).some(([path, expected]) => bundleSources[path] !== expected)) throw new Error('Producer inventory or bundle structure differs.');
    const exportBytes = await admit(entry.nativeExport.path, 32 * MiB, entry.nativeExport.sha256, entry.nativeExport.bytes, 'Native export');
    const exported = record(JSON.parse(exportBytes.toString()), 'native export');
    exact(exported, ['version', 'domain', 'roster', 'compilerFamilyId', 'nativeSources', 'catalog', 'graph', 'initialInputs', 'initialOutputs', 'initialStateFrameHex', 'qualification'], 'native export');
    const canonical = (v: unknown): string => JSON.stringify(v, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort()) : item);
    if (exported.version !== 1 || exported.domain !== 'iroha.street-motion-export.v1' || exported.roster !== roster
        || exported.compilerFamilyId !== native.compilerFamilyId || canonical(exported.nativeSources) !== canonical(nativeSources)
        || typeof exported.initialStateFrameHex !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(exported.initialStateFrameHex) || exported.initialStateFrameHex.length > 32768
        || canonical(exported.qualification) !== canonical({proof: false, ledger: false, acceptedRemovals: false})
        || ['graph', 'initialInputs', 'initialOutputs'].some(key => canonical(exported[key]) !== canonical(data[key]))) throw new Error('Bundle differs from selected native motion export.');
    const track = record(data.track, 'Street track'), catalog = record(exported.catalog, 'native catalog');
    const samples = track.samples as Record<string, number>[];
    if (!Array.isArray(samples) || !Array.isArray(track.gates) || !Array.isArray(data.objects)) throw new Error('Missing fixed native catalog.');
    const expectedCatalog = {track: track.id, topology: track.topology, lengthMm: track.lengthMm, maxTicks: track.maxTicks, laps: track.laps,
      road: samples.map(p => ['progressMm', 'eastMm', 'northMm', 'elevationMm', 'halfWidthMm', 'headingMicroturn', 'turnPerMetre', 'sector'].map(key => p[key])),
      gates: (track.gates as {sample: number}[]).map(g => g.sample), objects: (data.objects as Record<string, unknown>[]).map(o => Object.fromEntries(['kind', 'progressMm', 'lateralMm', 'halfLengthMm', 'halfWidthMm'].map(key => [key, o[key]]))) };
    if (canonical(catalog) !== canonical(expectedCatalog)) throw new Error('Bundle fixed catalog differs from native export.');
    const result = { bytes, bundle: data as unknown as StreetRaceBundle };
    cached.set(roster, result);
    return result;
  }
  async function verifyUnchanged() {
    for (const pin of pins.values()) {
      const current = await hashDirect(pin.path, pin.bytes);
      if (current.bytes !== pin.bytes || current.sha256 !== pin.sha256) throw new Error(`Admitted artifact changed: ${pin.path}`);
    }
  }
  async function evaluateInputs(roster: number, inputs: readonly (readonly number[])[]) {
    await readBundle(roster); await verifyUnchanged();
    if (!inputs.length || inputs.length > 20_000 || inputs.some(row => row.length !== 3 + 13 * roster || row.some(v => !Number.isSafeInteger(v)))) throw new Error('Invalid bounded parity corpus.');
    const temporary = await mkdtemp(resolve(directory, '.native-evaluation-'));
    const output: (number[] | null)[] = [];
    try {
      return await withStreetNative(nativeRoot, binaryPath, binary.sha256 as string, async execute => {
        for (let begin = 0; begin < inputs.length; begin += 256) {
          const request = resolve(temporary, `request-${begin}.json`), resultPath = resolve(temporary, `result-${begin}.json`);
          const rows = inputs.slice(begin, begin + 256);
          await writeFile(request, JSON.stringify({compiler_family_id: native.compilerFamilyId, roster, inputs: rows}), {flag: 'wx'});
          execute(['evaluate-street-motion', '--request-file', request, '--output-file', resultPath]);
          const result = await readBoundedNativeJson(resultPath, 4 * MiB);
          exact(result, ['version', 'domain', 'compilerFamilyId', 'roster', 'outputs'], 'native evaluation');
          const ports = (await readBundle(roster)).bundle.graph.outputs.length;
          if (result.version !== 1 || result.domain !== 'iroha.street-motion-evaluation.v1' || result.compilerFamilyId !== native.compilerFamilyId || result.roster !== roster
              || !Array.isArray(result.outputs) || result.outputs.length !== rows.length || result.outputs.some((row: unknown) => row !== null && (!Array.isArray(row) || row.length !== ports || row.some(v => !Number.isSafeInteger(v))))) throw new Error('Invalid native evaluation response.');
          output.push(...result.outputs);
        }
        await verifyUnchanged();
        return output;
      });
    } finally { await rm(temporary, {recursive: true, force: true}); }
  }
  function provenance() {
    return { loader: pins.get(loaderPath)!, boundedIo: pins.get(nativeFileModulePath)!, executor: pins.get(streetNativeModulePath)!, generation: pins.get(manifestPath)!, binary: pins.get(binaryPath)!, launcher: pins.get(launcherPath)!, compilerFamilyId: native.compilerFamilyId,
      nativeSources: Object.keys(nativeSources).sort().map(key => ({key, ...pins.get(resolve(nativeRoot, key))!})),
      producers: Object.keys(sources).sort().map(path => ({ key: path, ...pins.get(resolve(root, path))! })),
      bundles: entries.filter(entry => cached.has(entry.roster)).map(entry => ({ roster: entry.roster, nodes: entry.nodes, ...pins.get(entry.path)!, nativeExport: pins.get(entry.nativeExport.path)! })) };
  }
  return { directory, manifestPath, manifestBytes, entries, readBundle, evaluateInputs, verifyUnchanged, provenance };
}
