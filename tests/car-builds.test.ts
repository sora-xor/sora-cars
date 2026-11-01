import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODIES, BODY_IDS, BUILD_KEYS, EXHAUSTS, FENDERS, FRONT_AERO, LAMPS, LOWER_TONES, MIRRORS, OPTION_NAMES, PAINTS, SPOILERS, STANCES, STRIPES,
  STRIPE_COLOURS, WHEEL_COLOURS, WHEEL_STYLES, buildColours, isFactoryHachiroku, liveryPaint, paintInfo, practiceCars, readCarBuild, resolvedBuild,
  rivalCar, stockBuild, storedCarBuild, storyCar, validateCarBuild, type CarBuild,
} from '../src/game/car-builds';
import { LIVERIES } from '../src/game/rules';
import { CREW, RIVALS, storyGrid, storyStreetGrid, CHAPTERS } from '../src/game/story';
import { validateDriveReplay } from '../src/game/drive/arcade';
import { DRIVE_RULES } from '../src/game/drive/race';
import { STOCK_TUNE } from '../src/game/tuned-engine';

test('the factory car in each standard colour is exactly the hachiroku every race drew before builds', () => {
  LIVERIES.forEach(livery => {
    const build = stockBuild(livery.id);
    assert.equal(build.body, 'hachiroku');
    assert.equal(paintInfo(build.paint).color, livery.color);
    assert.equal(liveryPaint(livery.id).livery, livery.id);
    assert.ok(isFactoryHachiroku(build), livery.name);
  });
  assert.ok(!isFactoryHachiroku({ ...stockBuild(), body: 'raimei' }));
  assert.ok(!isFactoryHachiroku({ ...stockBuild(), paint: 'gunmetal' }), 'a period paint is a build');
  assert.ok(!isFactoryHachiroku({ ...stockBuild(), wheels: 'mesh' }));
});

test('a build is exactly its keys, each a known choice', () => {
  const choices: Record<string, readonly (string | boolean)[]> = {
    body: BODY_IDS, paint: PAINTS.map(p => p.id), lower: LOWER_TONES, stripe: STRIPES, stripeColour: STRIPE_COLOURS, wheels: WHEEL_STYLES,
    wheelColour: WHEEL_COLOURS, front: FRONT_AERO, skirts: [false, true], spoiler: SPOILERS, fenders: FENDERS, stance: STANCES, lamps: LAMPS,
    louvers: [false, true], exhaust: EXHAUSTS, mirrors: MIRRORS,
  };
  assert.deepEqual(Object.keys(choices).sort(), [...BUILD_KEYS].sort());
  for (const [key, values] of Object.entries(choices)) for (const value of values) {
    assert.equal(validateCarBuild({ ...stockBuild(), [key]: value })[key as keyof CarBuild], value, `${key} ${value}`);
  }
  assert.throws(() => validateCarBuild({ ...stockBuild(), wheels: 'chrome-spinners' }), /wheels/);
  assert.throws(() => validateCarBuild({ ...stockBuild(), paint: '#ff0000' }), /paint/);
  assert.throws(() => validateCarBuild({ ...stockBuild(), skirts: 'yes' }));
  assert.throws(() => validateCarBuild({ ...stockBuild(), turbo: 2 }), 'no extra keys: a build never carries performance');
  const { louvers: _louvers, ...missing } = stockBuild();
  assert.throws(() => validateCarBuild(missing));
  assert.throws(() => validateCarBuild([]));
  // Every option the garage shows has its Japanese and English names.
  for (const [key, values] of Object.entries(choices)) {
    if (key === 'body' || key === 'paint') continue;
    for (const value of values) {
      const name = (OPTION_NAMES as unknown as Record<string, Record<string, { ja: string; en: string }>>)[key]![String(value)];
      assert.ok(name?.ja && name.en, `${key} ${value} is named`);
    }
  }
});

test('a saved build round-trips; an unreadable save is the factory car in the saved colour', () => {
  const build = validateCarBuild({ ...stockBuild(3), body: 'mikazuki', wheels: 'mesh', stance: 'oni', louvers: true });
  assert.deepEqual(readCarBuild(JSON.parse(JSON.stringify(storedCarBuild(build)))), build);
  assert.deepEqual(readCarBuild({ version: 1, build: { ...build, body: 'delorean' } }, 4), stockBuild(4));
  assert.deepEqual(readCarBuild(null, 2), stockBuild(2));
  assert.deepEqual(readCarBuild({ version: 2, build }, 1), stockBuild(1));
});

test('the cars are named for SORA’s sky, and none after a wartime aircraft', () => {
  const sky = /[天空翔星斗月雷雲]/;
  for (const body of BODIES) {
    assert.ok(sky.test(body.name.ja) && sky.test(body.mark), `${body.id}: ${body.name.ja}`);
    assert.ok(body.name.en && body.kind.ja && body.kind.en && body.blurb.ja && body.blurb.en);
    for (const plane of ['疾風', '雷電', '流星', '隼', '紫電', '烈風', '彗星', '月光', '銀河', '飛燕', '零']) assert.ok(!body.name.ja.includes(plane), `${body.name.ja} avoids ${plane}`);
  }
  assert.equal(new Set(BODIES.map(body => body.name.en)).size, BODIES.length);
  assert.deepEqual(BODIES.map(body => body.id), [...BODY_IDS]);
  for (const paint of PAINTS) assert.match(paint.color, /^#[0-9a-f]{6}$/);
});

test('stock parts resolve to each body’s own, and colours come from the build', () => {
  const raimei = resolvedBuild(stockBuild(0, 'raimei'));
  assert.equal(raimei.mirrors, 'fender'); assert.equal(raimei.wheels, 'mesh');
  assert.equal(resolvedBuild(stockBuild(0, 'hibari')).spoiler, 'roof');
  const colours = buildColours({ ...stockBuild(), paint: 'midnight', lower: 'gold', stripe: 'twin', stripeColour: 'red', wheelColour: 'gold' });
  assert.equal(colours.paint, paintInfo('midnight').color); assert.equal(colours.finish, 'metallic');
  assert.notEqual(colours.lower, null); assert.notEqual(colours.stripe, colours.paint);
  assert.equal(buildColours({ ...stockBuild(), lower: 'body' }).lower, null);
});

test('rivals’ cars are the same every race, more modified in tougher fields, and varied', () => {
  for (let seed = 0; seed < 200; seed++) assert.deepEqual(rivalCar(seed, 0.5), rivalCar(seed, 0.5));
  const mods = (build: CarBuild) => [build.front !== 'stock', build.skirts, build.spoiler !== 'stock', build.fenders !== 'stock', build.stance !== 'stock',
    build.lamps !== 'none', build.louvers, build.exhaust !== 'stock', build.wheels !== 'stock'].filter(Boolean).length;
  const mean = (flair: number) => Array.from({ length: 300 }, (_, seed) => mods(rivalCar(seed, flair))).reduce((a, b) => a + b) / 300;
  assert.ok(mean(1) > mean(0.15) + 1, `legends ${mean(1)} vs club ${mean(0.15)}`);
  const player = validateCarBuild({ ...stockBuild(1), body: 'kakeru' });
  const grid = practiceCars('legends', 8, 6, player);
  assert.equal(grid.length, 8); assert.equal(grid[6], player);
  assert.deepEqual(grid, practiceCars('legends', 8, 6, player));
  assert.ok(new Set(grid.map(build => build.body)).size >= 3, 'a field of different cars');
  assert.notDeepEqual(practiceCars('club', 8, 6, player)[0], grid[0], 'each field has its own regulars');
});

test('the crew drive the hachiroku the cutscenes draw; rivals and guests bring their own cars', () => {
  for (const member of CREW.slice(1)) {
    const car = storyCar(member.name.ja);
    assert.equal(car?.body, 'hachiroku', member.id);
    assert.equal(storyCar(member.name.ja.replace(/（.*?）/, ''))?.paint, car!.paint, `${member.id} without furigana`);
  }
  // The racing rivals (Celeste negotiates; she never takes the grid).
  for (const rival of RIVALS.filter(rival => rival.id === 'rei' || rival.id === 'toru')) assert.notEqual(storyCar(rival.name.ja)?.body ?? 'hachiroku', 'hachiroku', rival.id);
  assert.equal(storyCar('YOU'), null);
  assert.equal(storyCar(`YOU · ${CREW[0]!.name.ja.replace(/（.*?）/, '')}`), null, 'the player drives their own build');
  for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
    for (const name of [...storyGrid(chapter), ...storyStreetGrid(chapter)]) {
      if (!name.startsWith('YOU')) assert.ok(storyCar(name), `chapter ${chapter}: ${name} has a car`);
    }
  }
});

test('a local replay keeps every car’s build as raced; earlier replays still load', () => {
  const builds = practiceCars('touge', 2, 1, validateCarBuild({ ...stockBuild(2), body: 'hokuto', wheels: 'dish' }));
  const replay = { version: 1, rules: DRIVE_RULES, trackId: 0, names: ['A', 'YOU'], skins: [0, 2], tunes: [STOCK_TUNE, STOCK_TUNE],
    inputs: Array.from({ length: 30 }, () => [1, 1]), savedAt: '2026-11-01T00:00:00.000Z', source: 'practice' as const };
  assert.equal(validateDriveReplay(replay).builds, undefined);
  assert.deepEqual(validateDriveReplay({ ...replay, builds }).builds, builds);
  assert.throws(() => validateDriveReplay({ ...replay, builds: builds.slice(0, 1) }), /roster/);
  assert.throws(() => validateDriveReplay({ ...replay, builds: [builds[0], { ...builds[1], body: 'kei-van' }] }), /body/);
});
