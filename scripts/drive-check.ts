import { readFileSync } from 'node:fs';
import { STREET_ASSET_MANIFEST } from '../src/game/street/asset-manifest';
import { CONTROL, TRACKS } from '../src/game/rules';
import { STOCK_TUNE } from '../src/game/tuned-engine';
import { DRIVER_SKILLS, DriveAI } from '../src/game/drive/ai';
import { sampleCourse } from '../src/game/drive/course';
import { countParts } from '../src/game/drive/damage';
import { DriveStatus, type DriveRace } from '../src/game/drive/race';
import { arcadeDriveRace, streetDriveRace } from '../src/game/drive/setup';
import { HUMAN_STYLES, HumanDriver } from '../tests/helpers/garage-drivers';

/** Eight AI drivers on every Arcade circuit and street route: finishing times,
 * contacts, wrecks, marshal recoveries and stalls. A tuning aid for the local
 * driving model. `npx tsx scripts/drive-check.ts [route…]`
 *
 * PLAYER=rookie or PLAYER=regular puts one of the garage's keyboard reference
 * drivers in slot 3 instead (SEED=n varies its habits). On the street routes it
 * also brakes for the bends it sees, overrating their speed by 15% or 7%, as a
 * player who does not know the road would.
 */
const only = process.argv.slice(2);
const scale = Number(process.env.SKILL ?? 1);
const skills = [DRIVER_SKILLS.ace, DRIVER_SKILLS.pro, DRIVER_SKILLS.pro, DRIVER_SKILLS.club, DRIVER_SKILLS.ace, DRIVER_SKILLS.club, DRIVER_SKILLS.pro, DRIVER_SKILLS.club]
  .map((skill, slot) => ({ ...skill, corner: Math.min(0.99, skill.corner * scale), brake: Math.min(0.97, skill.brake * scale), lane: [0, 0.4, -0.4, 0.8, -0.2, -0.8, 0.2, 0.6][slot]! }));
const PLAYER = 3, player = process.env.PLAYER as 'rookie' | 'regular' | undefined, seed = Number(process.env.SEED ?? 1);
if (player !== undefined && !(player in HUMAN_STYLES)) throw new Error('PLAYER must be rookie or regular');
const READING = { rookie: { optimism: 1.15, brake: 0.8, reaction: 0.45 }, regular: { optimism: 1.07, brake: 0.88, reaction: 0.35 } } as const;

/** The player's pedals for the bends ahead: the AI's braking sums with a human's misreading. */
function pedals(race: DriveRace, input: number, reading: typeof READING[keyof typeof READING]): number {
  const car = race.cars[PLAYER]!, spec = race.specs[PLAYER]!, speed = Math.max(car.u, 0), grip = spec.grip * 9.81;
  const corner = (kappa: number) => { const k = Math.abs(kappa) - grip * spec.downforce / 5184; return k <= 1e-6 ? 200 : Math.sqrt(grip / k); };
  const decel = (v: number) => (0.78 * grip * (1 + spec.downforce * v * v / 5184) + spec.drag * v * v / spec.mass) * reading.brake;
  const reach = speed * speed / (2 * decel(speed * 0.7)) + speed * reading.reaction + 10;
  let target = Infinity;
  for (let ahead = 0; ahead <= reach; ahead += 3) {
    const bend = corner(sampleCourse(race.course, car.s + ahead).kappa) * reading.optimism;
    target = Math.min(target, Math.sqrt(bend * bend + 2 * decel(bend) * Math.max(0, ahead - speed * reading.reaction)));
  }
  if (speed > target * 1.02) return (input & ~(CONTROL.throttle | CONTROL.boost)) | CONTROL.brake;
  return speed > target * 0.98 ? input & ~(CONTROL.throttle | CONTROL.boost) : input;
}

function run(label: string, race: DriveRace, street: boolean, target?: number): void {
  const ai = new DriveAI(skills), started = performance.now();
  const human = player ? new HumanDriver(HUMAN_STYLES[player], PLAYER, seed) : null;
  const counts = { wall: 0, car: 0, prop: 0, part: 0, wreck: 0, recover: 0 }, stalls = new Array(race.cars.length).fill(0);
  let peak = 0, playerWalls = 0, playerHard = 0;
  while (!race.done) {
    race.step(race.cars.map(car => human && car.slot === PLAYER
      ? street ? pedals(race, human.control(race), READING[player!]) : human.control(race) : ai.control(race, car.slot)));
    for (const event of race.events) {
      if (event.kind in counts) counts[event.kind as keyof typeof counts]++;
      if (human && event.slot === PLAYER && event.kind === 'wall') { playerWalls++; if (event.strength > 6) playerHard++; }
    }
    for (const car of race.cars) {
      if (car.status === DriveStatus.Racing && race.tick > 90 && car.u < 1) stalls[car.slot]++;
      peak = Math.max(peak, car.u);
    }
  }
  const times = race.cars.map(car => car.status === DriveStatus.Finished ? (car.finishTime / 30).toFixed(1)
    : car.status === DriveStatus.Wrecked ? 'WRECK' : `DNF@${Math.round(car.s)}m`);
  const damage = race.cars.map(car => Math.round(car.damage.total));
  console.log(`${label.padEnd(22)} ${target ? `song ${target.toFixed(0)}s ` : ''}times ${times.join(' ')}  dmg ${damage.join(',')}  ` +
    `walls ${counts.wall} cars ${counts.car} props ${counts.prop} parts ${counts.part} wrecks ${counts.wreck} recoveries ${counts.recover} stalls ${stalls.map(t => (t / 30).toFixed(0)).join(',')} ` +
    `peak ${(peak * 3.6).toFixed(0)}km/h  ${(performance.now() - started).toFixed(0)}ms`);
  if (human) {
    const car = race.cars[PLAYER]!, place = race.ranking().indexOf(PLAYER) + 1;
    console.log(`${''.padEnd(22)} ${player} (slot ${PLAYER}): ${times[PLAYER]} P${place}, ${damage[PLAYER]} damage, ${countParts(car.detached)} panels lost, ${playerWalls} wall touches (${playerHard} above 6 m/s)`);
  }
}

for (const track of TRACKS) {
  if (only.length && !only.includes(`arcade-${track.id}`)) continue;
  run(`arcade-${track.id} ${track.name}`, arcadeDriveRace(track.id, Array(8).fill(STOCK_TUNE)), false);
}
for (const route of STREET_ASSET_MANIFEST) {
  if (only.length && !only.includes(route.id)) continue;
  const bundle = JSON.parse(readFileSync(`public/${route.bundlePath}`, 'utf8'));
  run(route.id, streetDriveRace(bundle.track, bundle.objects, 8), true, route.musicDurationSeconds);
}
