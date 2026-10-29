import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { streetArtifactHash as hash } from '../../scripts/lib/street-generation';

/** Synthetic local integrity fixtures only: never native execution or proof evidence. */
export async function streetGenerationFixture(run: (root: string, manifest: any, generation: string, bundle: Buffer) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'street-native-generation-'));
  try {
    const lane = 'output/fresh generation', generation = `${lane}/generation.json`, key = 'crates/iroha_data_model/src/street_v1/layout.rs';
    const sources = {'scripts/fixture.ts': hash(Buffer.from('source'))};
    const manifest = {version: 1, domain: 'sora-cars.native-street-generation.v1', sources,
      native: {physicalSourceRoot: join(root, 'native'), compilerFamilyId: 'hash:1111111111111111111111111111111111111111111111111111111111111111#4667',
        sources: {[key]: hash(Buffer.from('layout'))}, binary: {path: `${lane}/native/iroha`, sha256: hash(Buffer.from('binary')), bytes: 6},
        launcher: {key: 'javascript/iroha_js/verify-pinned-native.mjs', sha256: hash(Buffer.from('launcher')), bytes: 8}},
      bundles: [] as any[], qualification: {proof: false, ledger: false, playability: false}};
    const track = {id: 'tokyo-1986', topology: 'circuit', lengthMm: 500000, laps: 1, maxTicks: 30, samples: [], gates: [],
      sound: {asset: 'yasukuni-1986.m4a', sha256: hash(Buffer.from('test-only music')), durationMs: 254952, cuesMs: [0]}};
    const catalog = {track: track.id, topology: track.topology, lengthMm: track.lengthMm, laps: track.laps, maxTicks: track.maxTicks, road: [], gates: [], objects: []};
    async function save(path: string, bytes: string | Buffer) {await mkdir(dirname(join(root, path)), {recursive: true}); await writeFile(join(root, path), bytes);}
    let selected!: Buffer;
    for (let roster = 2; roster <= 8; roster++) {
      const graph = {nodes: [0], outputs: []}, initialInputs: number[] = [], initialOutputs = {};
      const bundle = Buffer.from(JSON.stringify({version: 1, domain: 'sora-cars.street-race-draft.v1', roster, track, objects: [], graph, initialInputs, initialOutputs, sources}));
      const exported = Buffer.from(JSON.stringify({version: 1, domain: 'iroha.street-motion-export.v1', roster, compilerFamilyId: manifest.native.compilerFamilyId,
        nativeSources: manifest.native.sources, catalog, graph, initialInputs, initialOutputs, initialStateFrameHex: '00', qualification: {proof: false, ledger: false, acceptedRemovals: false}}));
      const path = `${lane}/bundles/tokyo-1986-${roster}.json`, exportPath = `${lane}/native-motion-${roster}.json`;
      manifest.bundles.push({path, roster, bytes: bundle.length, sha256: hash(bundle), nodes: 1, nativeExport: {path: exportPath, bytes: exported.length, sha256: hash(exported)}});
      await save(path, bundle); await save(exportPath, exported); if (roster === 8) selected = bundle;
    }
    for (const [path, value] of [[generation, JSON.stringify(manifest)], [manifest.native.binary.path, 'binary'], ['scripts/fixture.ts', 'source'], [`native/${key}`, 'layout'], [`native/${manifest.native.launcher.key}`, 'launcher'], ['world/audio/yasukuni-1986.m4a', 'test-only music']]) await save(path!, value!);
    await mkdir(join(root, 'src/game/street'), {recursive: true});
    await run(root, manifest, generation, selected);
  } finally {await rm(root, {recursive: true, force: true});}
}
