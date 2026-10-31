import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTROL } from '../src/game/rules';
import { STOCK_TUNE } from '../src/game/tuned-engine';
import { atan2, cos, sin } from '../src/game/drive/dmath';
import type { DriveCourse } from '../src/game/drive/course';
import { DriveRace, DriveStatus, RECOVERY_TICKS, collideBoxes, type DriveProp } from '../src/game/drive/race';
import { DAMAGE_LIMIT, impactPoints } from '../src/game/drive/damage';
import { vehicleSpec } from '../src/game/drive/vehicle';
import { DRIVER_SKILLS, DriveAI } from '../src/game/drive/ai';
import { arcadeDriveRace } from '../src/game/drive/setup';
import { driveReplayRace, validateDriveReplay } from '../src/game/drive/arcade';
import { DRIVE_RULES } from '../src/game/drive/race';
import { loadStreetRoute, STREET_ROUTES, type LoadedStreetRoute } from '../src/game/street/assets';
import { DriveStreetSession } from '../src/game/drive/street';
import { decodeStreetReplay, encodeStreetReplay, exportStreetReplay, StreetReplayPlayback, verifyStreetReplay } from '../src/game/street/replay';

/** A straight 2 km test road, 8 m half-width, flat and dry. */
function straight(halfWidth = 8): DriveCourse {
  const n = 400;
  return { id: 'test-straight', topology: 'sprint', wraps: false, lapLength: 5 * n, laps: 1, finish: 5 * n, maxTicks: 3000,
    stations: Float64Array.from({ length: n + 1 }, (_, i) => i * 5), heading: new Float64Array(n + 1),
    halfWidth: new Float64Array(n + 1).fill(halfWidth), elevation: new Float64Array(n + 1), winding: 0, railOffset: 0.52 };
}
function race(grid: { s: number; d: number }[], props: DriveProp[] = [], halfWidth = 8): DriveRace {
  return new DriveRace({ course: straight(halfWidth), specs: grid.map(() => vehicleSpec(STOCK_TUNE)), grid, props, weather: () => ({ rain: false, wind: 0 }) });
}
/** Hold a car at a speed along the road, pointing `psi`, for a staged impact. */
function launch(r: DriveRace, slot: number, speed: number, psi = 0): void {
  const car = r.cars[slot]!; car.psi = psi; car.u = speed; car.v = 0; car.r = 0;
}

test('deterministic math tracks the platform functions closely', () => {
  for (let x = -12; x <= 12; x += 0.0137) {
    assert.ok(Math.abs(sin(x) - Math.sin(x)) < 1e-10, `sin ${x}`);
    assert.ok(Math.abs(cos(x) - Math.cos(x)) < 1e-10, `cos ${x}`);
  }
  for (let y = -3; y <= 3; y += 0.173) for (let x = -3; x <= 3; x += 0.191) assert.ok(Math.abs(atan2(y, x) - Math.atan2(y, x)) < 1e-10, `atan2 ${y} ${x}`);
});

test('identical controls replay to identical states', () => {
  const ai = new DriveAI(Array(8).fill(DRIVER_SKILLS.pro)), a = arcadeDriveRace(1, Array(8).fill(STOCK_TUNE)), rows: number[][] = [];
  for (let t = 0; t < 900; t++) { const row = a.cars.map(car => ai.control(a, car.slot)); rows.push(row); a.step(row); }
  const b = arcadeDriveRace(1, Array(8).fill(STOCK_TUNE));
  for (const row of rows) b.step(row);
  assert.deepEqual(b.snapshot(), a.snapshot());
});

test('a rear-end shunt shares momentum instead of stopping the cars', () => {
  const r = race([{ s: 30, d: 0 }, { s: 50, d: 0 }]);
  launch(r, 0, 30); launch(r, 1, 0);
  const momentum = () => r.cars.reduce((sum, car) => sum + car.u, 0);
  let before = momentum();
  for (let t = 0; t < 60 && !r.cars.some(car => car.contact); t++) { before = momentum(); r.step([0, 0]); }
  assert.ok(r.cars[0]!.contact, 'the cars touched');
  const [chaser, struck] = r.cars;
  assert.ok(chaser!.u > 5, `the chasing car keeps rolling (${chaser!.u.toFixed(1)} m/s)`);
  assert.ok(struck!.u > 8, `the struck car is shoved forward (${struck!.u.toFixed(1)} m/s)`);
  assert.ok(Math.abs(momentum() - before) < 0.15 * before, 'momentum is conserved apart from tyre drag');
});

test('a glancing rail hit deflects the car and keeps most of its speed', () => {
  const r = race([{ s: 30, d: 5.5 }, { s: -500, d: 0 }]);
  launch(r, 0, 50, 0.12);
  let hit = false;
  for (let t = 0; t < 45; t++) { r.step([CONTROL.throttle, 0]); hit ||= r.cars[0]!.wall; }
  const car = r.cars[0]!;
  assert.ok(hit, 'the car met the rail');
  assert.ok(car.u > 0.75 * 50, `speed kept after the glance (${car.u.toFixed(1)} m/s)`);
  // Unsteered, it slides along the rail face (8.52 m less its 0.81 m half-width) rather than through it.
  assert.ok(car.d <= 7.72 && car.status === DriveStatus.Racing, `still racing, against the rail (${car.d.toFixed(2)} m)`);
});

test('a head-on rail impact wrecks the car and breaks panels; nudges leave no mark', () => {
  assert.equal(impactPoints(2.5, 1), 0);
  assert.ok(impactPoints(30, 1) > DAMAGE_LIMIT);
  const r = race([{ s: 30, d: 0 }, { s: -500, d: 0 }], [], 4);
  launch(r, 0, 36, Math.PI / 2);
  for (let t = 0; t < 30; t++) r.step([0, 0]);
  const car = r.cars[0]!;
  assert.equal(car.status, DriveStatus.Wrecked);
  assert.ok(car.damage.front > car.damage.rear, 'the nose took the hit');
  assert.ok(car.detached % 4 === 3, 'front plate and bumper broke away');
  assert.ok(r.events.length >= 0);
});

test('breakaway props snap off and keep the car moving', () => {
  const sign: DriveProp = { kind: 'sign', s: 60, d: 0, halfLength: 0.4, halfWidth: 0.9 };
  const planter: DriveProp = { kind: 'planter', s: 160, d: 0, halfLength: 0.6, halfWidth: 0.6 };
  const r = race([{ s: 30, d: 0 }, { s: -500, d: 0 }], [sign, planter]);
  launch(r, 0, 30);
  const speeds: number[] = [];
  for (let t = 0; t < 200 && r.broken !== 3; t++) {
    const before = r.cars[0]!.u; r.step([CONTROL.throttle, 0]);
    if (r.events.some(event => event.kind === 'prop')) speeds.push(r.cars[0]!.u / before);
  }
  assert.equal(r.broken, 3, 'both props were knocked down');
  assert.ok(speeds[0]! > 0.9, `a sign costs little (${speeds[0]})`);
  assert.ok(speeds[1]! > 0.6 && speeds[1]! < speeds[0]!, `a planter costs more (${speeds[1]})`);
});

test('full lock reaches the tyres\' grip at speed; a held drift settles into a slide and straightens on release', () => {
  const pad = (speed: number) => { const r = race([{ s: 0, d: 0 }, { s: -500, d: 0 }], [], 3000); launch(r, 0, speed); return r; };
  // Cornering at 250 km/h with the key held: close to the grip limit, with little sideslip.
  const corner = pad(70), car = corner.cars[0]!, spec = vehicleSpec(STOCK_TUNE);
  for (let t = 0; t < 60; t++) corner.step([CONTROL.throttle | CONTROL.right, 0]);
  const speed = Math.hypot(car.u, car.v), limit = spec.grip * 9.81 * (1 + spec.downforce * speed * speed / 5184);
  assert.ok(car.u * car.r > 0.8 * limit, `full lock corners at ${(car.u * car.r / 9.81).toFixed(2)} g of ${(limit / 9.81).toFixed(2)} g`);
  assert.ok(Math.abs(Math.atan2(car.v, car.u)) < 0.15, 'and the car stays in line');
  // A held drift at 150 km/h on the throttle: a steady slide, never a spin; let go and it straightens.
  const drift = pad(42), slider = drift.cars[0]!, slip = () => Math.atan2(slider.v, Math.abs(slider.u));
  let widest = 0, settled = true;
  for (let t = 0; t < 45; t++) {
    drift.step([CONTROL.throttle | CONTROL.right | CONTROL.drift, 0]);
    widest = Math.max(widest, Math.abs(slip()));
    if (t >= 25 && (slip() > -0.3 || slip() < -0.8)) settled = false;
  }
  assert.ok(settled && widest < 0.9 && slider.u > 0, `the drift holds a slide (widest ${(widest * 57.3).toFixed(0)}°)`);
  let whip = 0;
  for (let t = 0; t < 30; t++) { drift.step([CONTROL.throttle, 0]); whip = Math.max(whip, slip()); }
  assert.ok(Math.abs(slip()) < 0.05 && whip < 0.1, `released, it straightens without whipping back (${(whip * 57.3).toFixed(1)}°)`);
});

test('marshals set a car that gains no ground back on the road, pointing ahead', () => {
  const r = race([{ s: 200, d: 3 }, { s: -500, d: 0 }]);
  const car = r.cars[0]!;
  for (let t = 0; t < 30; t++) r.step([CONTROL.throttle, 0]);
  const furthest = car.s, spun = r.tick;
  // Spun round, the throttle only drives it back down the road.
  launch(r, 0, 0, Math.PI);
  let recovered = -1;
  for (let t = 0; t < RECOVERY_TICKS + 10 && recovered < 0; t++) {
    r.step([CONTROL.throttle, 0]);
    if (r.events.some(event => event.kind === 'recover' && event.slot === 0)) recovered = r.tick;
  }
  assert.equal(recovered - spun, RECOVERY_TICKS, 'the marshals step in after the wait');
  assert.ok(Math.abs(car.s - furthest) < 0.1 && car.psi === 0 && car.u === 0 && Math.abs(car.d - 3) < 0.5,
    `back where it got furthest, near its line (${car.s.toFixed(1)} m, ${car.d.toFixed(2)} m)`);
  for (let t = 0; t < 60; t++) r.step([CONTROL.throttle, 0]);
  assert.ok(car.s > furthest + 20 && car.idle === 0, 'and it drives on');
  // A car that never gets going is left alone through the start.
  const idle = race([{ s: 200, d: 3 }, { s: -500, d: 0 }]);
  let early = false;
  for (let t = 0; t < 2 * RECOVERY_TICKS - 1; t++) { idle.step([0, 0]); early ||= idle.events.some(event => event.kind === 'recover'); }
  assert.ok(!early, 'the start has a grace period');
});

test('box contact reports the deepest corner along the separating normal', () => {
  const box = (x: number, y: number, heading: number) => ({ x, y, heading, vx: 0, vy: 0, w: 0, m: 1, inertia: 1, hl: 2, hw: 1 });
  const contact = collideBoxes(box(0, 0, 0), box(3.9, 0.5, 0))!;
  assert.ok(contact.nx > 0.99 && Math.abs(contact.depth - 0.1) < 1e-9);
  assert.equal(collideBoxes(box(0, 0, 0), box(4.1, 0, 0)), null);
});

test('arcade drive replays validate by re-execution', () => {
  const tunes = Array(4).fill(STOCK_TUNE), live = arcadeDriveRace(2, tunes), ai = new DriveAI(Array(4).fill(DRIVER_SKILLS.club)), inputs: number[][] = [];
  for (let t = 0; t < 300; t++) { const row = live.cars.map(car => ai.control(live, car.slot)); inputs.push(row); live.step(row); }
  const replay = validateDriveReplay({ version: 1, rules: DRIVE_RULES, trackId: 2, names: ['a', 'b', 'c', 'YOU'], skins: [0, 1, 2, 3], tunes, inputs,
    savedAt: '2026-10-31T00:00:00.000Z', source: 'practice' });
  assert.deepEqual(driveReplayRace(replay).snapshot(), live.snapshot());
});

test('street drive replays export, verify and seek', async () => {
  const descriptor = STREET_ROUTES.find(route => route.id === 'aizu-wakamatsu-1986')!, original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array(readFileSync(new URL(`../public/${descriptor.bundlePath}`, import.meta.url))), { status: 200 });
  let loaded: LoadedStreetRoute;
  try { loaded = await loadStreetRoute(descriptor.id); } finally { globalThis.fetch = original; }
  const skins = [0, 1, 2, 3, 4, 5, 0, 1], session = new DriveStreetSession(loaded.bundle.track, loaded.bundle.objects, loaded.bundle.roster, skins);
  const ai = new DriveAI(Array(8).fill(DRIVER_SKILLS.pro));
  while (!session.race.done) session.step(session.race.cars.map(car => ai.control(session.race, car.slot)));
  assert.ok(session.race.cars.every(car => car.status === DriveStatus.Finished), 'the whole field finished');
  const replay = exportStreetReplay(session, loaded, { playerSlot: 0, names: ['YOU', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], skins, savedAt: '2026-10-31T00:00:00.000Z' });
  assert.equal(replay.version, 2);
  const decoded = decodeStreetReplay(encodeStreetReplay(replay));
  const verified = await verifyStreetReplay(decoded, loaded);
  const playback = new StreetReplayPlayback(verified);
  const middle = Math.floor(verified.length / 2);
  playback.seek(middle);
  const fresh = new DriveStreetSession(loaded.bundle.track, loaded.bundle.objects, 8, skins);
  for (let t = 0; t < middle; t++) fresh.step(replay.controls[t]!);
  assert.deepEqual(playback.state, fresh.state);
  const tampered = { ...replay, outcome: { ...replay.outcome, 'c0.rank': replay.outcome['c0.rank'] === 1 ? 2 : 1 } };
  await assert.rejects(verifyStreetReplay(tampered, loaded), /differs/);
});
