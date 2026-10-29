import { readFile } from 'node:fs/promises';
import { compileStreetTrack, type AuthoredStreetTrack } from './lib/street-track-compiler';

/** Place real sites beside an authored route for its scene: progress along the
 * road (metres), the driver's side (+1 left, -1 right, as the period city
 * counts them) and the clearance from the road edge. Uses the compiler's own
 * local projection. Usage: tsx scripts/street-landmark-placement.ts <route.json> <id=lat,lon>... */
const [routePath, ...sites] = process.argv.slice(2);
if (!routePath || !sites.length) throw new Error('Use <route.json> <id=lat,lon> [...]');
const track = compileStreetTrack(JSON.parse(await readFile(routePath, 'utf8')) as AuthoredStreetTrack);
const [lon0, lat0] = track.originE7.map(value => value / 1e7) as [number, number];
const radians = Math.PI / 180, earthRadiusMm = 6371008800, longitudeScale = Math.cos(lat0 * radians);
for (const site of sites) {
  const [id, coordinates] = site.split('='), [lat, lon] = (coordinates ?? '').split(',').map(Number);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Unreadable site ${site}`);
  const east = (lon! - lon0) * radians * earthRadiusMm * longitudeScale, north = (lat! - lat0) * radians * earthRadiusMm;
  let best = { distance: Infinity, p: 0, side: 1, width: 0 };
  for (let i = 0; i < track.samples.length - 1; i++) {
    const a = track.samples[i]!, b = track.samples[i + 1]!, dx = b.eastMm - a.eastMm, dy = b.northMm - a.northMm;
    const t = Math.max(0, Math.min(1, ((east - a.eastMm) * dx + (north - a.northMm) * dy) / (dx * dx + dy * dy)));
    const px = a.eastMm + dx * t, py = a.northMm + dy * t, distance = Math.hypot(east - px, north - py);
    // Cross product sign: positive when the site lies left of the direction of travel.
    const cross = dx * (north - a.northMm) - dy * (east - a.eastMm);
    if (distance < best.distance) best = { distance, p: a.progressMm + (b.progressMm - a.progressMm) * t, side: cross > 0 ? 1 : -1, width: a.halfWidthMm };
  }
  console.log(`${id}: p ${(best.p / 1000).toFixed(0)} m, side ${best.side > 0 ? '+1 (left)' : '-1 (right)'}, clearance ${((best.distance - best.width) / 1000).toFixed(0)} m from the road edge`);
}
