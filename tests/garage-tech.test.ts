import test from 'node:test';
import assert from 'node:assert/strict';
import { botControl, copyRace, createRace, raceFinished, stepRace, validateReplay, type ReplayV1 } from '../src/game/engine';
import { RACE_RULES_HASH } from '../src/game/environment';
import { GARAGE_RULES, isGarageReplay, localReplayState, validateLocalReplay, type GarageReplayV1 } from '../src/game/garage-replay';
import { environmentContacts } from '../src/game/environment-events';
import { CONTROL as C, TRACKS } from '../src/game/rules';
import { vehicleSpec } from '../src/game/drive/vehicle';
import { DRAFT_RANGE, STOCK_TUNE, TRACTION_SPEED, TUNE_BOUNDS, TUNE_FIELDS, inWake, isStockTune, stepTunedRace, validateTune, type CarTune } from '../src/game/tuned-engine';
import {
  MAX_FUNDS, PRACTICE_FIELDS, PURSE, STARTING_FUNDS, STORY_TORU, TECH_BRANCHES, TECH_NODES, applyAward, buildValue, buyPart, fieldRivals,
  fitPart, fittedParts, garageTune, missingParts, newGarage, partState, raceAward, readGarage, rivalBuild, storyClearBonus, storyRivals, techNode, tuneFor,
  type GarageSave,
} from '../src/game/garage-tech';

const tuned = (changes: Partial<CarTune>): CarTune[] => [{ ...STOCK_TUNE, ...changes }, STOCK_TUNE];
const rich = (owned: string[] = []): GarageSave => ({ ...newGarage(), money: MAX_FUNDS, owned });

test('the stock tune reproduces native RaceV1 tick for tick, including every contact', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const trackId of [0, 1, 2]) for (const players of [2, 5, 8]) for (const noisy of [false, true]) {
    const native = createRace(trackId, players), garage = copyRace(native), tunes = native.cars.map(() => STOCK_TUNE);
    while (!raceFinished(native)) {
      const row = native.cars.map(car => noisy && random() < 0.2 ? Math.floor(random() * 64) : botControl(native, car.slot));
      stepRace(native, row); stepTunedRace(garage, row, tunes);
      assert.deepEqual(garage, native, `track ${trackId}, ${players} cars, tick ${native.tick}`);
      assert.deepEqual(environmentContacts(garage), environmentContacts(native));
    }
  }
});

test('tunes are validated, bounded and the garage-only mechanics are zero at stock', () => {
  assert.ok(isStockTune(STOCK_TUNE));
  assert.deepEqual(validateTune({ ...STOCK_TUNE }), STOCK_TUNE);
  for (const field of ['boostKick', 'driftCharge', 'draft', 'traction'] as const) assert.equal(STOCK_TUNE[field], 0);
  for (const field of TUNE_FIELDS) {
    const [lo, hi] = TUNE_BOUNDS[field];
    assert.ok(lo <= STOCK_TUNE[field] && STOCK_TUNE[field] <= hi, field);
    assert.throws(() => validateTune({ ...STOCK_TUNE, [field]: hi + 1 }));
  }
  assert.throws(() => validateTune({ ...STOCK_TUNE, extra: 1 }));
  assert.throws(() => validateTune({ ...STOCK_TUNE, topSpeed: 2400.5 }));
  assert.throws(() => validateTune({ ...STOCK_TUNE, topSpeed: 2800, boostSpeed: 2800 }));
  assert.throws(() => stepTunedRace(createRace(0, 2), [1, 1], [STOCK_TUNE]));
});

test('the stock tune is exactly the driving model\u2019s stock car, so equal-car races and replays ignore the garage', () => {
  const spec = vehicleSpec(STOCK_TUNE), engine = vehicleSpec({ ...STOCK_TUNE, accel: STOCK_TUNE.accel + 1 }).power - spec.power;
  assert.deepEqual([spec.grip, spec.steerLock, spec.railFriction, spec.launch, spec.driftCharge, spec.draft, spec.draftSpeed, spec.boostKick, spec.toughness],
    [2.35, 0.5, 1, 0, 0, 0, 0, 0, 1]);
  assert.equal(spec.boostPower, spec.power * 0.9);
  assert.ok(engine > 0);
  // Tuned fields reach the car: boost power grows as the cube of the boost top speed.
  assert.equal(vehicleSpec(tuneFor(['turbo-controller', 'turbo-intercooler', 'turbo-big'])).boostPower, spec.boostPower * (3480 / 3000) ** 3);
});

test('drift charge pays only for drifting into a corner at speed, scaled by its curvature', () => {
  const track = TRACKS[0]!, cell = track.curves.indexOf(2), progress = Math.ceil(cell * track.length / 12) + 1000;
  const energyAfter = (control: number, changes: Partial<CarTune>, speed = 2000) => {
    const state = createRace(0, 2);
    Object.assign(state.cars[0]!, { progress, x: 0, speed, energy: 500 });
    state.cars[1]!.progress = -12000;
    stepTunedRace(state, [control, 0], tuned(changes));
    return state.cars[0]!.energy;
  };
  const into = C.throttle | C.drift | C.left; // curvature +2 pushes right, so the corner is to the left
  assert.equal(energyAfter(into, {}), 504, 'stock cars only recharge');
  assert.equal(energyAfter(into, { driftCharge: 12 }), 504 + 12);
  assert.equal(energyAfter(C.throttle | C.drift | C.right, { driftCharge: 12 }), 504, 'steering out of the corner');
  assert.equal(energyAfter(C.throttle | C.left, { driftCharge: 12 }), 504, 'no drift held');
  assert.equal(energyAfter(into, { driftCharge: 12 }, 1000), 504, 'too slow to drift');
  assert.equal(energyAfter(into | C.boost, { driftCharge: 12 }), 475, 'boosting spends instead');
  const gentle = track.curves.indexOf(1), state = createRace(0, 2);
  Object.assign(state.cars[0]!, { progress: Math.ceil(gentle * track.length / 12) + 1000, speed: 2000, energy: 500 });
  stepTunedRace(state, [into, 0], tuned({ driftCharge: 12 }));
  assert.equal(state.cars[0]!.energy, 504 + 6, 'half the charge at curvature 1');
});

test('slipstream lifts the speed cap only inside a wake beyond contact range', () => {
  const cap = (gap: number, dx: number, draft: number) => {
    const state = createRace(0, 2);
    Object.assign(state.cars[0]!, { progress: 100000, x: 0, speed: 2400 });
    Object.assign(state.cars[1]!, { progress: 100000 + gap, x: dx, speed: 2400 });
    const towed = inWake(state, 0);
    stepTunedRace(state, [C.throttle, C.throttle], tuned({ draft }));
    return { towed, speed: state.cars[0]!.speed };
  };
  assert.deepEqual(cap(10000, 0, 160), { towed: true, speed: 2440 });
  assert.deepEqual(cap(10000, 0, 0), { towed: true, speed: 2400 }, 'no aero, no tow');
  assert.equal(cap(DRAFT_RANGE.near, 0, 160).speed, 2400, 'contact range is not a wake');
  assert.equal(cap(DRAFT_RANGE.far + 1, 0, 160).speed, 2400);
  assert.equal(cap(10000, DRAFT_RANGE.width, 160).speed, 2400, 'a different lane');
  const lead = createRace(0, 2);
  Object.assign(lead.cars[1]!, { progress: 10000, speed: 2400 });
  lead.cars[1]!.finishTick = 1;
  assert.equal(inWake(lead, 0), false, 'finished cars tow nobody');
});

test('anti-lag and traction add acceleration only where they claim to', () => {
  const speedAfter = (control: number, speed: number, changes: Partial<CarTune>) => {
    const state = createRace(0, 2); Object.assign(state.cars[0]!, { progress: 100000, x: 0, speed });
    stepTunedRace(state, [control, 0], tuned(changes)); return state.cars[0]!.speed;
  };
  assert.equal(speedAfter(C.throttle | C.boost, 2400, { boostKick: 20 }), 2460);
  assert.equal(speedAfter(C.throttle, 2000, { boostKick: 20 }), 2040);
  assert.equal(speedAfter(C.throttle, TRACTION_SPEED - 1, { traction: 24 }), TRACTION_SPEED - 1 + 64);
  assert.equal(speedAfter(C.throttle, TRACTION_SPEED, { traction: 24 }), TRACTION_SPEED + 40);
  assert.equal(speedAfter(0, 1000, { traction: 24 }), 988, 'traction never moves a coasting car');
});

test('the tree is a four-branch web: linear tiers, one setup fork each, cross-branch capstones', () => {
  assert.equal(new Set(TECH_NODES.map(node => node.id)).size, TECH_NODES.length);
  assert.deepEqual(TECH_BRANCHES.map(branch => branch.id), ['engine', 'turbo', 'chassis', 'body']);
  for (const branch of TECH_BRANCHES) {
    const parts = TECH_NODES.filter(node => node.branch === branch.id);
    assert.deepEqual(parts.map(node => node.tier), [1, 2, 3, 3, 4], branch.id);
    const fork = parts.filter(node => node.fork);
    assert.equal(fork.length, 2); assert.equal(fork[0]!.fork, fork[1]!.fork);
    const capstone = parts.find(node => node.tier === 4)!;
    assert.deepEqual([...capstone.requiresAny!].sort(), fork.map(node => node.id).sort());
    assert.ok(capstone.requires.every(id => techNode(id)!.branch !== branch.id), 'capstones need another branch');
    const costs = parts.map(node => node.cost);
    assert.ok(costs[0]! < costs[1]! && costs[1]! < Math.min(costs[2]!, costs[3]!) && Math.max(costs[2]!, costs[3]!) < costs[4]!, `${branch.id} costs rise by tier`);
  }
  for (const node of TECH_NODES) for (const id of [...node.requires, ...node.requiresAny ?? []]) {
    assert.ok(techNode(id), id); assert.ok(techNode(id)!.tier < node.tier, `${node.id} needs a lower-tier ${id}`);
  }
  let save = rich();
  for (let bought = true; bought;) {
    bought = false;
    for (const node of TECH_NODES) if (partState(save, node.id) === 'available') { save = buyPart(save, node.id); bought = true; }
  }
  assert.equal(save.owned.length, TECH_NODES.length, 'every part is reachable');
});

test('no build reaches an engine bound, so no purchase is silently wasted', () => {
  const raw = (ids: readonly string[]) => {
    const tune: Record<string, number> = { ...STOCK_TUNE };
    for (const id of ids) for (const [field, delta] of Object.entries(techNode(id)!.effects)) tune[field]! += delta;
    return tune as unknown as CarTune;
  };
  const forks = [['engine-highrev', 'engine-torque'], ['turbo-big', 'turbo-twin'], ['chassis-touge', 'chassis-rally'], ['body-light', 'body-armor']];
  const base = TECH_NODES.filter(node => !node.fork).map(node => node.id);
  for (let mask = 0; mask < 16; mask++) {
    const build = [...base, ...forks.map((pair, i) => pair[(mask >> i) & 1]!)];
    assert.deepEqual(validateTune(raw(build)), tuneFor(build));
    const everything = { ...rich(TECH_NODES.map(node => node.id)), setup: Object.fromEntries(forks.map((pair, i) => [techNode(pair[0]!)!.fork!, pair[(mask >> i) & 1]!])) };
    assert.deepEqual(garageTune(everything), tuneFor(build), 'the fitted setup is the car');
  }
});

test('buying spends prize money, forks swap freely and the equal-cars switch restores stock', () => {
  let save = newGarage();
  assert.equal(save.money, STARTING_FUNDS);
  assert.equal(partState(save, 'engine-intake'), 'available');
  assert.equal(partState(save, 'engine-cams'), 'locked');
  assert.deepEqual(missingParts(save, 'engine-fulltune').map(node => node.id), ['turbo-intercooler', 'engine-highrev']);
  save = buyPart(save, 'engine-intake');
  assert.equal(save.money, STARTING_FUNDS - 10000);
  assert.equal(partState(save, 'engine-intake'), 'fitted');
  assert.equal(partState(save, 'engine-cams'), 'short');
  assert.throws(() => buyPart(save, 'engine-intake'), /already own/);
  assert.throws(() => buyPart(save, 'engine-cams'), /Not enough/);
  assert.throws(() => buyPart(save, 'turbo-intercooler'), /required/);
  assert.equal(garageTune(save).topSpeed, 2424);

  save = buyPart(buyPart({ ...save, money: 500000 }, 'engine-cams'), 'engine-highrev');
  save = buyPart(save, 'engine-torque');
  assert.equal(partState(save, 'engine-torque'), 'fitted', 'the newest option is fitted');
  assert.equal(partState(save, 'engine-highrev'), 'stored');
  assert.deepEqual(fittedParts(save), ['engine-intake', 'engine-cams', 'engine-torque']);
  save = fitPart(save, 'engine-highrev');
  assert.equal(garageTune(save).topSpeed, 2400 + 24 + 24 + 48);
  assert.throws(() => fitPart(save, 'engine-cams'), /setup options/);
  assert.deepEqual(garageTune({ ...save, stock: true }), STOCK_TUNE);
  assert.equal(buildValue(fittedParts(save)), 10000 + 24000 + 52000);
});

test('saved garages keep only parts this build recognises with their requirements intact', () => {
  assert.deepEqual(readGarage(null), newGarage());
  assert.deepEqual(readGarage({ version: 2 }), newGarage());
  const restored = readGarage({ version: 1, money: 777, earned: 1000, owned: ['engine-cams', 'ghost-part', 'turbo-twin', 'engine-intake', 'engine-intake'], setup: { 'engine-spec': 'engine-highrev', 'turbo-spec': 'body-cage' }, stock: true, fields: ['legends', 'touge', 'nowhere'], cleared: [3, 3, -1, 2.5, 1] });
  assert.deepEqual(restored.owned, ['engine-intake', 'engine-cams'], 'unknown parts and orphans are dropped');
  assert.deepEqual(restored.setup, {});
  assert.deepEqual(restored.fields, ['club', 'touge', 'legends']);
  assert.deepEqual(restored.cleared, [1, 3]);
  assert.equal(restored.stock, true); assert.equal(restored.money, 777);
  assert.equal(readGarage({ ...newGarage(), money: -5 }).money, STARTING_FUNDS);
  assert.equal(readGarage({ ...newGarage(), money: MAX_FUNDS * 2 }).money, MAX_FUNDS);
  const forked = readGarage({ ...newGarage(), owned: ['body-cage', 'body-bumpers', 'body-light', 'body-armor'], setup: { 'body-spec': 'body-armor' } });
  assert.equal(partState(forked, 'body-armor'), 'fitted'); assert.equal(partState(forked, 'body-light'), 'stored');
});

test('prize money pays by place and tier, rewards clean driving and pays each story clear once', () => {
  const save = newGarage();
  assert.deepEqual(raceAward(save, { place: 1, cars: 8, field: 'club', clean: true }), { purse: 6000, clean: 1000, chapter: 0, total: 7000, unlocked: 'touge' });
  assert.equal(raceAward(save, { place: 4, cars: 8, field: 'club', clean: false }).unlocked, null, 'only a podium opens the next field');
  assert.equal(raceAward(save, { place: 8, cars: 8, field: 'legends', clean: false }).total, Math.round(PURSE[7]! * 3.4));
  assert.equal(raceAward(save, { place: 2, cars: 2, field: 'club', clean: false }).purse, PURSE[7]);
  assert.equal(raceAward({ ...save, fields: ['club', 'touge'] }, { place: 1, cars: 8, field: 'club', clean: false }).unlocked, null);
  assert.throws(() => raceAward(save, { place: 9, cars: 8, field: 'club', clean: false }));
  const story = raceAward(save, { place: 3, cars: 8, field: null, chapter: 4, objective: true, clean: false });
  assert.deepEqual(story, { purse: 4200, clean: 0, chapter: storyClearBonus(4), total: 4200 + storyClearBonus(4), unlocked: null });
  const after = applyAward(save, story, 4);
  assert.deepEqual(after.cleared, [4]); assert.equal(after.money, STARTING_FUNDS + story.total); assert.equal(after.earned, story.total);
  assert.equal(raceAward(after, { place: 1, cars: 8, field: null, chapter: 4, objective: true, clean: false }).chapter, 0, 'a clear pays once');
  assert.equal(raceAward(save, { place: 5, cars: 8, field: null, chapter: 4, objective: false, clean: false }).chapter, 0);
  assert.deepEqual(applyAward(save, raceAward(save, { place: 1, cars: 8, field: 'club', clean: true })).fields, ['club', 'touge']);
  assert.equal(applyAward({ ...save, money: MAX_FUNDS - 1 }, story, 4).money, MAX_FUNDS);
});

test('opponent builds respect prerequisites and budgets, spread through the field', () => {
  for (const style of ['power', 'boost', 'tough'] as const) for (const budget of [0, 25000, 90000, 400000, 2000000]) {
    const build = rivalBuild(style, budget);
    assert.ok(buildValue(build) <= budget);
    build.forEach((id, i) => assert.equal(missingParts({ ...newGarage(), owned: build.slice(0, i) }, id).length, 0, `${style} buys ${id} in order`));
    assert.equal(new Set(build.map(id => techNode(id)!.fork).filter(Boolean)).size, build.filter(id => techNode(id)!.fork).length, 'one option per fork');
  }
  for (const field of PRACTICE_FIELDS) {
    const rivals = fieldRivals(field.id, 8, 6);
    assert.equal(rivals[6], null); assert.equal(rivals.filter(Boolean).length, 7);
    if (field.budget) assert.ok(rivals[7]!.value > rivals[0]!.value, `${field.id} spreads its builds`);
  }
  assert.ok(fieldRivals('club', 8, 6).every(rival => !rival || isStockTune(rival.tune) && rival.skill === 'club'), 'club night is the original practice grid');
  assert.ok(storyRivals(0, 8, 6).every(rival => !rival || isStockTune(rival.tune)));
  const showdown = storyRivals(10, 8, 6);
  assert.ok(showdown.every((rival, slot) => !rival || [5, 7].includes(slot) || isStockTune(rival.tune)), 'the crew drive stock cars');
  assert.ok(showdown[7]!.value <= STORY_TORU[10] * 1000 && showdown[7]!.value > 0);
});

test('garage replays carry their own rules identity and re-simulate exactly', () => {
  const tunes = [tuneFor(['engine-intake', 'chassis-tyres']), STOCK_TUNE, tuneFor(rivalBuild('power', 60000))];
  const state = createRace(1, 3), inputs: number[][] = [];
  for (let tick = 0; tick < 240; tick++) { const row = state.cars.map(car => botControl(state, car.slot) | (tick % 50 < 20 ? C.boost : 0)); inputs.push(row); stepTunedRace(state, row, tunes); }
  const replay: GarageReplayV1 = { version: 1, rules: GARAGE_RULES, baseRulesHash: RACE_RULES_HASH, trackId: 1, names: ['A', 'YOU', 'C'], skins: [0, 1, 2], tunes, inputs, savedAt: '2026-10-29T00:00:00Z', source: 'practice' };
  const valid = validateLocalReplay(JSON.parse(JSON.stringify(replay)));
  assert.ok(isGarageReplay(valid));
  assert.deepEqual(localReplayState(valid), state);
  assert.throws(() => validateReplay(replay), /unsupported/, 'never accepted as a RaceV1 transcript');
  assert.throws(() => validateLocalReplay({ ...replay, tunes: tunes.map(() => STOCK_TUNE) }), /RaceV1 replay/);
  assert.throws(() => validateLocalReplay({ ...replay, tunes: [{ ...tunes[0]!, topSpeed: 9999 }, ...tunes.slice(1)] }), /out of bounds/);
  assert.throws(() => validateLocalReplay({ ...replay, baseRulesHash: '0'.repeat(64) }), /unsupported/);
  assert.throws(() => validateLocalReplay({ ...replay, tunes: tunes.slice(1) }), /unsupported/);
  const stock: ReplayV1 = { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: 0, names: ['A', 'B'], skins: [0, 1], inputs: [[1, 1]], savedAt: '2026-10-29T00:00:00Z', source: 'practice' };
  assert.deepEqual(validateLocalReplay(stock), stock, 'stock practice stays a RaceV1 replay');
});
