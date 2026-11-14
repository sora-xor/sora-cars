import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RACE_ROAD, raceRoadCoefficients } from '../src/game/race-roads-table';

/**
 * Writes RaceV1's real roads into the native checkout: for each Arcade course, the bend under every 5 m of its
 * unrolled three-lap road, as the integer coefficient RaceV1 multiplies by speed² (docs/live-races-real-roads.md).
 * The coefficients come from the same headings the local driving model integrates
 * (src/game/generated/arcade-roads.json, built by scripts/build-arcade-geography.ts), so live and local races run
 * one road. Consensus reads only the checked-in integer table.
 *
 * Usage: tsx scripts/generate-native-race-roads.ts --iroha-root <absolute native checkout> [--roads <absolute
 * arcade-roads.json>] [--check]
 */
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const value = (flag: string): string | undefined => {
  const at = args.indexOf(flag);
  if (at < 0) return undefined;
  const given = args[at + 1];
  if (!given || !isAbsolute(given)) throw new Error(`${flag} needs an absolute path.`);
  return given;
};
const irohaRoot = value('--iroha-root');
if (!irohaRoot) throw new Error('Specify --iroha-root with an absolute native checkout path.');
const roadsPath = value('--roads') ?? resolve(root, 'src/game/generated/arcade-roads.json');
const known = new Set(['--iroha-root', '--roads', '--check']);
const flags = args.filter((_, i) => i === 0 || !['--iroha-root', '--roads'].includes(args[i - 1]!));
if (flags.some(flag => !known.has(flag)) || new Set(flags).size !== flags.length) throw new Error('Unexpected generation arguments.');
const check = flags.includes('--check');

const native = await realpath(irohaRoot);
await readFile(resolve(native, 'Cargo.toml'));
const text = await readFile(roadsPath, 'utf8');
const roads = JSON.parse(text) as Parameters<typeof raceRoadCoefficients>[0];
const sha256 = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
/** Rust digit grouping (`16_777_216`). */
const grouped = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '_');

/** The wire names RaceV1 keeps (Midnight Circuit, Harbor Run and Sakura Pass are tracks 0, 1 and 2). */
const TRACKS = [
  { constant: 'NEON_TOKYO', course: 'Midnight Circuit: National Route 1 from Hakone-Yumoto to Miyanoshita' },
  { constant: 'HARBOR', course: 'Harbor Run: Sakuragichō over Bankoku-bashi and along the Yokohama waterfront to Honmoku' },
  { constant: 'SAKURA', course: 'Sakura Pass: National Routes 119 and 120 from the JNR Nikkō station to Kiyotaki' },
] as const;

const rows = (values: readonly number[]) => {
  const lines: string[] = [];
  for (let i = 0; i < values.length; i += 16) lines.push(`    ${values.slice(i, i + 16).join(', ')},`);
  return lines.join('\n');
};
const tables = TRACKS.map(({ constant, course }, track) => {
  const values = raceRoadCoefficients(roads, track);
  const longest = Math.max(...values.map(Math.abs));
  return `/// ${course}: ${values.length} stations, |coefficient| <= ${longest}.\n`
    + `pub const ${constant}: [i16; ${values.length}] = [\n${rows(values)}\n];`;
});
const rust = `// Generated offline by sora-cars/scripts/generate-native-race-roads.ts from
// src/game/generated/arcade-roads.json (sha256 ${sha256(text)}). Do not edit.
//! RaceV1's real roads (1986): the bend under each 5 m of an Arcade course's unrolled three-lap road.
//!
//! Station \`s\` covers progress \`[s * STATION_MM - LEAD_MM, (s + 1) * STATION_MM - LEAD_MM)\`, from the lead-in
//! 100 m before the start line to the finish. Its coefficient is \`K = -round_half_away(dh * ${grouped(RACE_ROAD.numerator)} /
//! ${grouped(RACE_ROAD.denominator)})\`, where \`dh\` is the change of the road's heading (radians x 10^5, clockwise) over the
//! station; that is \`-round(kappa * 7/1000 * 2^24)\` for curvature \`kappa\` in rad/m. A car at speed \`v\` mm/tick is
//! pushed \`trunc(K * v * v / 2^24)\` mm a tick: seven ticks of the bend's centripetal acceleration, outward.

/// Length of one station in millimetres.
pub const STATION_MM: i64 = ${grouped(RACE_ROAD.stationMm)};
/// Distance from the first station to the start line in millimetres.
pub const LEAD_MM: i64 = ${grouped(RACE_ROAD.leadMm)};
/// Divisor of the bend force: \`trunc(K * speed^2 / FORCE_DIVISOR)\`.
pub const FORCE_DIVISOR: i64 = ${grouped(RACE_ROAD.forceDivisor)};

${tables.join('\n\n')}
`;
const output = resolve(native, 'crates/iroha_execution_stark/src/games/race_v1_roads.rs');
if (check) {
  if (await readFile(output, 'utf8').catch(() => '') !== rust) throw new Error(`${output} is out of date: run scripts/generate-native-race-roads.ts`);
  console.log(`${output} is current.`);
} else {
  await writeFile(output, rust);
  console.log(`wrote ${output} (${TRACKS.map((_, track) => raceRoadCoefficients(roads, track).length).join(' / ')} stations)`);
}
