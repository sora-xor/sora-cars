import test from 'node:test';
import assert from 'node:assert/strict';
import { roadSide } from '../src/game/three/terrain';
import { periodCityRouteFrame, type PeriodCityPose } from '../src/game/three/period-city/layout';

/** A road that bends one way and then back (radius 90 m), poses every 2.5 m, advancing along (sin h, cos h). */
function windingRoad(): PeriodCityPose[] {
  const poses: PeriodCityPose[] = [];
  let x = 0, z = 0, heading = .4;
  for (let p = 0; p <= 600; p += 2.5) {
    poses.push({ p, x, y: 0, z, heading, width: 4 });
    heading += (p < 300 ? 1 : -1) * 2.5 / 90;
    x += Math.sin(heading) * 2.5; z += Math.cos(heading) * 2.5;
  }
  return poses;
}

test('the slope terrain puts a point on the side of the road the period city does', () => {
  const poses = windingRoad(), frame = periodCityRouteFrame({ length: 600, circuit: false, poses }, 60);
  // The hillside's stations stand every 5 m and decide by the nearest one (terrain.ts createSlopeTerrain).
  const stations = poses.filter((_, i) => i % 2 === 0);
  let seed = 7, checked = 0;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 500; k++) {
    const at = poses[20 + Math.floor(random() * (poses.length - 40))]!, offset = (random() < .5 ? -1 : 1) * (at.width + 3 + random() * 40);
    const x = at.x + Math.cos(at.heading) * offset + (random() - .5) * 4, z = at.z - Math.sin(at.heading) * offset + (random() - .5) * 4;
    const route = frame(x, z);
    assert.ok(route, `no route frame at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    let nearest = stations[0]!;
    for (const station of stations) if (Math.hypot(x - station.x, z - station.z) < Math.hypot(x - nearest.x, z - nearest.z)) nearest = station;
    assert.equal(roadSide(x, z, nearest), route.side, `side at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    assert.equal(route.side, Math.sign(offset), 'the offset side');
    checked++;
  }
  assert.equal(checked, 500);
});
