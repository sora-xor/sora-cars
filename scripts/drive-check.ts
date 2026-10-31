import { readFileSync } from 'node:fs';
import { STREET_ASSET_MANIFEST } from '../src/game/street/asset-manifest';
import { TRACKS } from '../src/game/rules';
import { STOCK_TUNE } from '../src/game/tuned-engine';
import { DRIVER_SKILLS, DriveAI } from '../src/game/drive/ai';
import { DriveStatus, type DriveRace } from '../src/game/drive/race';
import { arcadeDriveRace, streetDriveRace } from '../src/game/drive/setup';

/** Eight AI drivers on every Arcade circuit and street route: finishing times,
 * contacts, wrecks and stalls. A tuning aid for the local driving model.
 * `npx tsx scripts/drive-check.ts [route…]`
 */
const only = process.argv.slice(2);
const scale = Number(process.env.SKILL ?? 1);
const skills = [DRIVER_SKILLS.ace, DRIVER_SKILLS.pro, DRIVER_SKILLS.pro, DRIVER_SKILLS.club, DRIVER_SKILLS.ace, DRIVER_SKILLS.club, DRIVER_SKILLS.pro, DRIVER_SKILLS.club]
  .map((skill, slot) => ({ ...skill, corner: Math.min(0.99, skill.corner * scale), brake: Math.min(0.97, skill.brake * scale), lane: [0, 0.4, -0.4, 0.8, -0.2, -0.8, 0.2, 0.6][slot]! }));

function run(label: string, race: DriveRace, target?: number): void {
  const ai = new DriveAI(skills), started = performance.now();
  const counts = { wall: 0, car: 0, prop: 0, part: 0, wreck: 0 }, stalls = new Array(race.cars.length).fill(0);
  let peak = 0;
  while (!race.done) {
    race.step(race.cars.map(car => ai.control(race, car.slot)));
    for (const event of race.events) if (event.kind in counts) counts[event.kind as keyof typeof counts]++;
    for (const car of race.cars) {
      if (car.status === DriveStatus.Racing && race.tick > 90 && car.u < 1) stalls[car.slot]++;
      peak = Math.max(peak, car.u);
    }
  }
  const times = race.cars.map(car => car.status === DriveStatus.Finished ? (car.finishTime / 30).toFixed(1)
    : car.status === DriveStatus.Wrecked ? 'WRECK' : `DNF@${Math.round(car.s)}m`);
  const damage = race.cars.map(car => Math.round(car.damage.total));
  console.log(`${label.padEnd(22)} ${target ? `song ${target.toFixed(0)}s ` : ''}times ${times.join(' ')}  dmg ${damage.join(',')}  ` +
    `walls ${counts.wall} cars ${counts.car} props ${counts.prop} parts ${counts.part} wrecks ${counts.wreck} stalls ${stalls.map(t => (t / 30).toFixed(0)).join(',')} ` +
    `peak ${(peak * 3.6).toFixed(0)}km/h  ${(performance.now() - started).toFixed(0)}ms`);
}

for (const track of TRACKS) {
  if (only.length && !only.includes(`arcade-${track.id}`)) continue;
  run(`arcade-${track.id} ${track.name}`, arcadeDriveRace(track.id, Array(8).fill(STOCK_TUNE)));
}
for (const route of STREET_ASSET_MANIFEST) {
  if (only.length && !only.includes(route.id)) continue;
  const bundle = JSON.parse(readFileSync(`public/${route.bundlePath}`, 'utf8'));
  run(route.id, streetDriveRace(bundle.track, bundle.objects, 8), route.musicDurationSeconds);
}
