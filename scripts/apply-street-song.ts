import { readFile, writeFile } from 'node:fs/promises';
import { STREET_ROUTE_SONGS, streetSongSectionsMs } from '../src/game/street/route-songs';
import { streetRouteAuthoring } from './lib/street-routes';

/** Bind a route's authoring to its rendered song: the file digest and measured
 * length, chapter cues on the song's section starts, and the race target.
 * Usage: tsx scripts/apply-street-song.ts <route> <section index>... (chapters after the first) */
const [route, ...chapterSections] = process.argv.slice(2);
const song = STREET_ROUTE_SONGS.find(item => item.route === route);
if (!route || !song) throw new Error('Use <route with a composed song> <section index>...');
const report = JSON.parse(await readFile(`output/audio/street-songs/${route}.json`, 'utf8'));
if (report.route !== route || report.sections !== song.sections || Math.abs(report.scoreSeconds - song.seconds) > 1e-6) {
  throw new Error(`Render ${route} again: its report does not match the current composition.`);
}
const starts = streetSongSectionsMs(song, .08), sections = chapterSections.map(Number);
if (sections.some((section, i) => !Number.isInteger(section) || section < 1 || section >= song.sections || i > 0 && section <= sections[i - 1]!)) {
  throw new Error('Chapter sections must rise strictly within the song.');
}
const path = streetRouteAuthoring(route).track, authored = JSON.parse(await readFile(path, 'utf8'));
authored.sound = { asset: `${route}.m4a`, sha256: report.sha256, durationMs: report.durationMs, cuesMs: [0, ...sections.map(section => starts[section]!)] };
authored.targetMs = report.durationMs;
await writeFile(path, JSON.stringify(authored, null, 2) + '\n');
console.log(`${route}: ${report.durationMs} ms, cues ${authored.sound.cuesMs.join(', ')}`);
