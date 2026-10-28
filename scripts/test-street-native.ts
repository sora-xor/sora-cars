import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { compileStreetTrack, streetRustTable, type AuthoredStreetTrack } from './lib/street-track-compiler';
import { streetHeadingAt, streetHeadingChange, streetSampleAt, streetIntervalAt, MAX_STREET_PROGRESS_MM } from '../src/game/street/track';

// Standalone std-only arithmetic qualification; no Cargo, Iroha checkout mutation
// or new execution-profile admission is performed by this script.
const output = resolve('output/qualification/street-geometry');
await mkdir(output, { recursive: true });
const source = JSON.parse(await readFile('world/authoring/tokyo-1986.json', 'utf8')) as AuthoredStreetTrack;
const sprintSource: AuthoredStreetTrack = { ...source, id: 'tokyo-sprint-fixture', topology: 'sprint', laps: 1,
  points: source.points.slice(0, 16).map((point, i, points) => ({ ...point, gate: i === 0 || i === points.length - 1 || point.gate })) };
const tracks = [compileStreetTrack(source), compileStreetTrack({ ...source, points: [source.points[0]!, ...source.points.slice(1).reverse()] }), compileStreetTrack(sprintSource)];
const checks: { progress: number[]; changes: number[][] }[] = [];
for (const track of tracks) {
  const positions = new Set<number>([-MAX_STREET_PROGRESS_MM, MAX_STREET_PROGRESS_MM, -12000, -1, 0, track.lengthMm * track.laps,
    track.lengthMm - 1, track.lengthMm, track.lengthMm + 1]);
  for (let i = 0; i < track.samples.length - 1; i++) {
    const point = track.samples[i]!.progressMm, end = track.samples[i + 1]!.progressMm;
    for (const p of [point - 1, point, point + 1, Math.floor((point + end) / 2), end - 1]) {
      positions.add(p); positions.add(p - track.lengthMm); positions.add(p + track.lengthMm);
    }
  }
  const progress = [...positions].sort((a, b) => a - b);
  const changes = progress.slice(1).map((to, i) => [progress[i]!, to, streetHeadingChange(track, progress[i]!, to)]);
  checks.push({ progress, changes });
}
const fixtures = tracks.map((track, index) => `mod route_${index} {\n${streetRustTable(track)}\npub const EXPECTED: &[[i64; 5]] = &[\n${checks[index]!.progress.map(p => {
  const [start, end] = streetIntervalAt(track, p);
  return `    [${p}, ${streetSampleAt(track, p).progressMm}, ${streetHeadingAt(track, p)}, ${start.progressMm}, ${end.progressMm}],`;
}).join('\n')}\n];\npub const CHANGES: &[[i64; 3]] = &[\n${checks[index]!.changes.map(row => `    [${row.join(', ')}],`).join('\n')}\n];\n}`).join('\n');
const program = `#[path = ${JSON.stringify(resolve('world/native/street_geometry.rs'))}]\nmod geometry;\n${fixtures}\n
#[test] fn browser_native_samples_headings_and_changes() {
    for (topology, length, road, expected, changes) in [
        (route_0::TOPOLOGY, route_0::LENGTH_MM, &route_0::ROAD[..], route_0::EXPECTED, route_0::CHANGES),
        (route_1::TOPOLOGY, route_1::LENGTH_MM, &route_1::ROAD[..], route_1::EXPECTED, route_1::CHANGES),
        (route_2::TOPOLOGY, route_2::LENGTH_MM, &route_2::ROAD[..], route_2::EXPECTED, route_2::CHANGES),
    ] {
        let route = geometry::StreetGeometry::new(topology, length, road).unwrap();
        for row in expected {
            assert_eq!(route.sample_at(row[0]).unwrap()[0], row[1], "sample at {}", row[0]);
            assert_eq!(route.heading_at(row[0]).unwrap(), row[2], "heading at {}", row[0]);
            let interval = route.interval_at(row[0]).unwrap();
            assert_eq!((interval.0[0], interval.1[0]), (row[3], row[4]), "interval at {}", row[0]);
            assert!(interval.0[0] < interval.1[0]);
        }
        for row in changes { assert_eq!(route.heading_change(row[0], row[1]).unwrap(), row[2]); }
    }
}
#[test] fn malformed_table_and_progress_reject() {
    let route = geometry::StreetGeometry::new(route_0::TOPOLOGY, route_0::LENGTH_MM, &route_0::ROAD).unwrap();
    let sprint = geometry::StreetGeometry::new(route_2::TOPOLOGY, route_2::LENGTH_MM, &route_2::ROAD).unwrap();
    for p in [i64::MIN, i64::MAX, -100_000_001, 100_000_001] {
        for geometry in [route, sprint] {
            assert!(geometry.heading_at(p).is_err());
            assert!(geometry.sample_at(p).is_err());
            assert!(geometry.interval_at(p).is_err());
        }
    }
    let mut changed = route_0::ROAD.to_vec(); changed[1][0] += 1;
    assert!(geometry::StreetGeometry::new(route_0::TOPOLOGY, route_0::LENGTH_MM, &changed).is_err());
    changed = route_0::ROAD.to_vec(); changed.last_mut().unwrap()[5] += 1;
    assert!(geometry::StreetGeometry::new(route_0::TOPOLOGY, route_0::LENGTH_MM, &changed).is_err());
    assert!(geometry::StreetGeometry::new(route_0::TOPOLOGY, 0, &route_0::ROAD).is_err());
}
#[test] fn topology_and_sprint_endpoint_reject() {
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_0::LENGTH_MM, &route_0::ROAD).is_err());
    assert!(geometry::StreetGeometry::new(geometry::Topology::Circuit, route_2::LENGTH_MM, &route_2::ROAD).is_err());
    let mut changed = route_2::ROAD.to_vec(); changed.last_mut().unwrap()[5] += 1;
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_2::LENGTH_MM, &changed).is_err());
    changed = route_2::ROAD.to_vec(); changed[0][6] = 1;
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_2::LENGTH_MM, &changed).is_err());
    changed = route_2::ROAD.to_vec(); changed.last_mut().unwrap()[6] = 1;
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_2::LENGTH_MM, &changed).is_err());
    changed = route_2::ROAD.to_vec(); let first = changed[0];
    changed.last_mut().unwrap()[1] = first[1]; changed.last_mut().unwrap()[2] = first[2];
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_2::LENGTH_MM, &changed).is_err());
    changed = route_2::ROAD.to_vec(); changed[1][1] = changed[0][1]; changed[1][2] = changed[0][2];
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_2::LENGTH_MM, &changed).is_err());
    changed = route_2::ROAD.to_vec(); changed[1][5] = changed[0][5] + 100_000;
    assert!(geometry::StreetGeometry::new(geometry::Topology::Sprint, route_2::LENGTH_MM, &changed).is_err());
}
`;
await writeFile(resolve(output, 'geometry_parity.rs'), program);
const rustc = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
execFileSync('rustc', ['--edition=2024', '-O', '--test', '-A', 'dead_code', resolve(output, 'geometry_parity.rs'), '-o', resolve(output, 'geometry_parity')], { stdio: 'pipe' });
const result = execFileSync(resolve(output, 'geometry_parity'), ['--nocapture'], { encoding: 'utf8' });
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sources = Object.fromEntries(await Promise.all(['scripts/lib/street-track-compiler.ts', 'src/game/street/track.ts', 'world/native/street_geometry.rs', 'scripts/test-street-native.ts', 'world/authoring/tokyo-1986.json'].map(async p => [p, hash(await readFile(p))])));
const report = { version: 1, scope: 'Standalone native integer geometry parity only. No driving/AIR/STARK/consensus qualification.', rustc, sources,
  generatedHarnessSha256: hash(program), binarySha256: hash(await readFile(resolve(output, 'geometry_parity'))),
  directions: tracks.map((track, i) => ({ id: track.id, topology: track.topology, reversed: i === 1, lengthMm: track.lengthMm, samples: track.samples.length,
    winding: track.samples.at(-1)!.headingMicroturn - track.samples[0]!.headingMicroturn, lookups: checks[i]!.progress.length, changes: checks[i]!.changes.length })),
  qualification: { scalarGeometryParity: true, fullNativeSimulation: false, proof: false, historicalAlignment: false }, result };
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(result.trim());
console.log(`${checks.reduce((n, c) => n + c.progress.length, 0)} native/browser sample+interval+heading cases and ${checks.reduce((n, c) => n + c.changes.length, 0)} heading changes agree exactly.`);
