import { readFile, writeFile } from 'node:fs/promises';
import { gsiElevation } from './lib/gsi-elevation';

/** Trace the real road an Arcade course is set on: chain OpenStreetMap ways through a list of waypoints, resample the
 * centreline every 5 m and read each station's ground height from the GSI elevation model. The result is research
 * data (world/research/arcade/<id>.road.json); scripts/build-arcade-geography.ts turns it into the course's profile.
 *
 * Usage: tsx scripts/trace-arcade-road.ts <id> <overpass.json[,more.json]> <lat,lon> <lat,lon> [more waypoints…] [name=lat,lon …]
 *   [without=<way name or ref>,…]
 * The Overpass files are `out geom` results for the area's highways (https://overpass-api.de). Named places are
 * reported with their distance along the road, for placing landmarks; they are not stored. `without=` leaves out
 * roads built after 1986 (Yokohama's Route 357 and the Minato Mirai avenues), which OpenStreetMap maps as they are now.
 */
const [id, sources, ...rest] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]+$/.test(id) || !sources) throw new Error('Use <id> <overpass.json[,…]> <lat,lon> <lat,lon> … [name=lat,lon …]');
const pair = (text: string) => { const [lat, lon] = text.split(',').map(Number); if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Bad coordinate ${text}`); return [lat!, lon!] as const; };
const without = new Set(rest.filter(arg => arg.startsWith('without=')).flatMap(arg => arg.slice(8).split(',')));
const stops = rest.filter(arg => !arg.includes('=')).map(pair);
const named = rest.filter(arg => arg.includes('=') && !arg.startsWith('without=')).map(arg => { const [name, at] = arg.split('='); return { name: name!, at: pair(at!) }; });
if (stops.length < 2) throw new Error('Give at least a start and an end waypoint.');
const EARTH = 6371008.8, RAD = Math.PI / 180;
const metres = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((b[1]! - a[1]!) * RAD * Math.cos((a[0]! + b[0]!) / 2 * RAD), (b[0]! - a[0]!) * RAD) * EARTH;

/** How much longer a metre of each kind of road counts when chaining the waypoints, so a course keeps to the main
 * road a driver would take instead of cutting along a parallel lane or into a service yard and back. Since the
 * Arcade courses follow their roads' real bends (2026-11-11), a trace must be one continuous drive: the first
 * Yokohama trace, routed by length alone, ran down two side streets and back and along a residential lane. */
const CLASS_COST: Readonly<Record<string, number>> = { trunk: 1, primary: 1, secondary: 1.1, tertiary: 1.25, unclassified: 2,
  trunk_link: 1.5, primary_link: 1.5, secondary_link: 1.6, tertiary_link: 1.8, residential: 3, living_street: 4, service: 4 };
const nodes = new Map<number, readonly [number, number]>(), edges = new Map<number, { to: number; d: number; cost: number }[]>();
for (const file of sources.split(',')) {
  const data = JSON.parse(await readFile(file, 'utf8')) as { elements: { type: string; nodes: number[]; geometry: { lat: number; lon: number }[]; tags?: Record<string, string> }[] };
  for (const way of data.elements) {
    if (way.type !== 'way' || without.has(way.tags?.name ?? '') || without.has(way.tags?.ref ?? '')) continue;
    const tags = way.tags ?? {}, factor = CLASS_COST[tags.highway ?? ''] ?? 3;
    // A divided road is two one-way ways: following the traffic picks the carriageway the course drives on.
    const oneway = tags.oneway === 'yes' || tags.oneway === '1' || tags.junction === 'roundabout' ? 1 : tags.oneway === '-1' ? -1 : 0;
    way.nodes.forEach((node, i) => nodes.set(node, [way.geometry[i]!.lat, way.geometry[i]!.lon]));
    for (let i = 0; i + 1 < way.nodes.length; i++) {
      const a = way.nodes[i]!, b = way.nodes[i + 1]!, d = metres(nodes.get(a)!, nodes.get(b)!);
      if (oneway >= 0) (edges.get(a) ?? edges.set(a, []).get(a)!).push({ to: b, d, cost: d * factor });
      if (oneway <= 0) (edges.get(b) ?? edges.set(b, []).get(b)!).push({ to: a, d, cost: d * factor });
    }
  }
}
const nearest = (at: readonly number[]) => {
  let best = -1, off = Infinity;
  for (const [node, position] of nodes) { const d = metres(at, position); if (d < off) { off = d; best = node; } }
  return { node: best, off };
};
/** Cheapest chain of ways between two nodes by `CLASS_COST` (Dijkstra; the areas are a few thousand nodes). */
function chain(from: number, to: number): number[] {
  const distance = new Map<number, number>([[from, 0]]), previous = new Map<number, number>(), settled = new Set<number>();
  for (;;) {
    let current = -1, least = Infinity;
    for (const [node, d] of distance) if (!settled.has(node) && d < least) { least = d; current = node; }
    if (current < 0) throw new Error('No road joins two of the waypoints.');
    if (current === to) break;
    settled.add(current);
    for (const { to: next, cost } of edges.get(current) ?? []) {
      const total = least + cost;
      if (total < (distance.get(next) ?? Infinity)) { distance.set(next, total); previous.set(next, current); }
    }
  }
  const result = [to];
  while (result[0] !== from) result.unshift(previous.get(result[0]!)!);
  return result;
}
const ends = stops.map(nearest);
ends.forEach((end, i) => { if (end.off > 60) console.warn(`waypoint ${i} is ${end.off.toFixed(0)} m from the nearest road node`); });
let path: number[] = [];
for (let i = 0; i + 1 < ends.length; i++) { const leg = chain(ends[i]!.node, ends[i + 1]!.node); path = path.concat(i ? leg.slice(1) : leg); }
const line = path.map(node => nodes.get(node)!);
const stations: [number, number, number, number][] = [];
let travelled = 0, next = 0;
for (let i = 0; i + 1 < line.length; i++) {
  const a = line[i]!, b = line[i + 1]!, d = metres(a, b);
  while (next <= travelled + d) {
    const t = d ? (next - travelled) / d : 0, lat = a[0] + (b[0] - a[0]) * t, lon = a[1] + (b[1] - a[1]) * t;
    stations.push([next, +lat.toFixed(6), +lon.toFixed(6), +(await gsiElevation(lat, lon)).toFixed(2)]);
    next += 5;
  }
  travelled += d;
}
await writeFile(`world/research/arcade/${id}.road.json`, `${JSON.stringify({
  id, tracedAt: new Date().toISOString().slice(0, 10),
  source: 'Centreline: OpenStreetMap ways (ODbL), chained through the waypoints. Heights: GSI elevation tiles (dem5a/5b/5c, then dem), ground surface, unsmoothed.',
  waypoints: stops, lengthM: +travelled.toFixed(1), stationFields: ['distanceM', 'lat', 'lon', 'groundM'], stations,
})}\n`);
console.log(`${id}: ${(travelled / 1000).toFixed(3)} km, ${stations.length} stations, ${stations[0]![3]} m → ${stations.at(-1)![3]} m`);
for (const { name, at } of named) {
  let best = 0, off = Infinity;
  stations.forEach(([, lat, lon], i) => { const d = metres(at, [lat, lon]); if (d < off) { off = d; best = i; } });
  console.log(`${name.padEnd(24)} ${String(stations[best]![0]).padStart(5)} m along, ${off.toFixed(0).padStart(4)} m from the road`);
}
