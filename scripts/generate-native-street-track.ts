import { readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStreetTrack, streetRustTable, type AuthoredStreetTrack } from './lib/street-track-compiler';
import { compileStreetObjects, streetObjectRustTable, type AuthoredStreetObjects } from './lib/street-object-compiler';
import { LEDGER_STREET_ROUTE, STREET_ROUTE_IDS, nativeStreetRouteModule, streetRouteAuthoring } from './lib/street-routes';

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
const shared = [
  'scripts/generate-native-street-track.ts',
  'scripts/lib/street-routes.ts',
  'scripts/lib/street-track-compiler.ts',
  'scripts/lib/street-object-compiler.ts',
  'src/game/street/objects.ts',
  'src/game/street/track.ts',
];
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
if (STREET_ROUTE_IDS[0] !== LEDGER_STREET_ROUTE || new Set(STREET_ROUTE_IDS).size !== STREET_ROUTE_IDS.length) {
  throw new Error('The native catalog lists Tokyo first and each route once.');
}
const routes = [];
for (const id of STREET_ROUTE_IDS) {
  const files = streetRouteAuthoring(id), sources = [...shared, files.track, files.objects];
  const inputs = Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(resolve(root, path)))])));
  const track = compileStreetTrack(JSON.parse(await readFile(resolve(root, files.track), 'utf8')) as AuthoredStreetTrack);
  const objects = compileStreetObjects(track, JSON.parse(await readFile(resolve(root, files.objects), 'utf8')) as AuthoredStreetObjects);
  if (track.id !== id) throw new Error(`${files.track} names ${track.id}, not ${id}.`);
  const rust = ('// Generated offline by sora-cars/scripts/generate-native-street-track.ts.\n'
    + '// Exact integer catalog; this does not establish surveyed historical accuracy or proof qualification.\n'
    + streetRustTable(track) + '\n' + streetObjectRustTable(objects, track))
    .replaceAll('crate::geometry', 'crate::execution_proofs::street_v1::compiler::geometry')
    .replaceAll('crate::hazards', 'crate::execution_proofs::street_v1::compiler::hazards')
    .replace(/\bpub /g, 'pub(super) ');
  routes.push({ id, file: `${nativeStreetRouteModule(id)}.rs`, rust, provenance: { version: 1, track: track.id, inputs,
    compiledTrackSha256: hash(JSON.stringify(track) + '\n'),
    compiledObjectsSha256: hash(JSON.stringify(objects) + '\n'),
    generatedRustSha256: hash(rust), samples: track.samples.length, gates: track.gates.length,
    hazards: objects.objects.length, lengthMm: track.lengthMm, laps: track.laps, maxTicks: track.maxTicks,
    historicalAlignmentQualified: false, executionProfileRegistered: false } });
}
const [tokyo, ...local] = routes;

/** The export module's route list. Only Tokyo is declared by the compiler itself. */
const registry = `// Generated offline by sora-cars/scripts/generate-native-street-track.ts. Do not edit.
//! Fixed route tables available to offline Street motion exports.
//!
//! The ledger selector \`StreetTrackV1\` and the compiler family still name Tokyo
//! alone. The other members are local development routes for browser practice:
//! they can be exported and evaluated offline, but no session can select them
//! and nothing here registers a profile. Their generated tables are identified
//! by the export's native source inventory, not by the compiler family.
use super::super::{geometry::Topology, hazards::Hazard, tokyo_1986};
${local.map(route => `
#[rustfmt::skip]
#[path = "${route.file}"]
mod ${nativeStreetRouteModule(route.id)};
`).join('')}
/// One route's frozen road, gate and roadside tables.
pub(super) struct StreetRouteV1 {
    /// Kebab-case identifier shared with the app's authoring and compiled JSON.
    pub(super) key: &'static str,
    pub(super) topology: Topology,
    pub(super) length_mm: i64,
    pub(super) max_ticks: u32,
    pub(super) laps: u32,
    pub(super) road: &'static [[i64; 8]],
    pub(super) gates: &'static [usize],
    pub(super) hazards: fn() -> Vec<Hazard>,
    /// Repository path and exact bytes of the generated table.
    pub(super) source_path: &'static str,
    pub(super) source: &'static [u8],
}

macro_rules! route {
    ($key:literal, $table:ident, $file:literal) => {
        StreetRouteV1 {
            key: $key,
            topology: $table::TOPOLOGY,
            length_mm: $table::LENGTH_MM,
            max_ticks: $table::MAX_TICKS,
            laps: $table::LAPS,
            road: &$table::ROAD,
            gates: &$table::GATES,
            hazards: $table::hazards,
            source_path: concat!("crates/iroha_core/src/execution_proofs/street_v1/compiler/", $file),
            source: include_bytes!($file),
        }
    };
}

/// Every exportable route, Tokyo first.
pub(super) const ROUTES: &[StreetRouteV1] = &[
${routes.map(route => `    route!("${route.id}", ${nativeStreetRouteModule(route.id)}, "${route.file}"),`).join('\n')}
];

/// The route with this exact key, if the native catalog compiled it.
pub(super) fn route(key: &str) -> Option<&'static StreetRouteV1> {
    ROUTES.iter().find(|route| route.key == key)
}
`;
const files: [string, string][] = [
  ['tokyo_1986.rs', tokyo!.rust],
  ['TRACK_PROVENANCE.json', JSON.stringify(tokyo!.provenance, null, 2) + '\n'],
  ...local.map(route => [route.file, route.rust] as [string, string]),
  ['routes.rs', registry],
  ['ROUTE_PROVENANCE.json', JSON.stringify({ version: 1, ledgerRoute: tokyo!.id,
    localRoutes: local.map(route => ({ ...route.provenance, localDevelopmentRoute: true })),
    generatedRoutesSha256: hash(registry) }, null, 2) + '\n'],
];
const folder = resolve(native, 'crates/iroha_core/src/execution_proofs/street_v1/compiler');
for (const [name, bytes] of files) {
  const path = resolve(folder, name);
  if (args.includes('--check')) {
    if (await readFile(path, 'utf8') !== bytes) throw new Error(`Generated native catalog differs: ${name}`);
  } else await writeFile(path, bytes);
}
console.log(`${args.includes('--check') ? 'Checked' : 'Generated'} native Street catalog: ${routes.map(route =>
  `${route.id} (${route.provenance.samples} road rows, ${route.provenance.hazards} objects)`).join(', ')}.`);
