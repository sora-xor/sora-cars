import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCADE_ROADS, arcadePlan, arcadeRoadHeight } from '../src/game/arcade-geography';
import { arcadeDriveCourse, courseHeading, sampleCourse } from '../src/game/drive/course';
import { TRACKS } from '../src/game/rules';
import { ARCADE_1986_CROSSINGS, ARCADE_1986_LANDMARKS, ARCADE_1986_STREET, ARCADE_1986_STRETCHES, arcadeBankAt, arcadeDistrictAt,
  arcadePlaceAt } from '../src/game/three/period-city/layout';
import { setTerrainRelief, terrainHeightAt } from '../src/game/three/terrain';

const length = (track: number) => TRACKS[track]!.length / 1000 * 3;

test('each Arcade course carries the heights of its real road', () => {
  // Route 1 climbs from Hakone-Yumoto (about 95 m) to Miyanoshita (about 415 m).
  assert.equal(arcadeRoadHeight(0, 0), 0);
  const hakone = arcadeRoadHeight(0, length(0));
  assert.ok(hakone > 300 && hakone < 340, `Hakone climbs ${hakone.toFixed(0)} m`);
  assert.ok(Math.abs(ARCADE_ROADS[0]!.startElevation - 95) < 5 && Math.abs(ARCADE_ROADS[0]!.finishElevation - 415) < 8);
  // Nikkō's road climbs from the station (532 m) to the rise before Kiyotaki (707 m).
  const nikko = arcadeRoadHeight(2, length(2));
  assert.ok(nikko > 165 && nikko < 185, `Nikkō climbs ${nikko.toFixed(0)} m`);
  // Yokohama's quays stay within a few metres of sea level, bridges included.
  for (let p = -100; p <= length(1) + 500; p += 10) assert.ok(Math.abs(arcadeRoadHeight(1, p)) < 5, `Yokohama at ${p} m`);
  // Hakone never descends for long: every kilometre ends higher than it began.
  for (let p = 0; p + 1000 <= length(0); p += 500) assert.ok(arcadeRoadHeight(0, p + 1000) > arcadeRoadHeight(0, p) + 20);
});

test('the road surface is graded: no step and no grade beyond a mountain road', () => {
  for (const track of [0, 1, 2]) {
    let steepest = 0;
    for (let p = -100; p < length(track) + 500; p += 1) {
      const rise = arcadeRoadHeight(track, p + 1) - arcadeRoadHeight(track, p);
      steepest = Math.max(steepest, Math.abs(rise));
    }
    assert.ok(steepest < (track === 1 ? .04 : .11), `track ${track}: steepest metre rises ${steepest.toFixed(3)} m`);
    // Level beyond the drawn road, and on a track that does not exist.
    assert.equal(arcadeRoadHeight(track, -5000), arcadeRoadHeight(track, -100));
    assert.equal(arcadeRoadHeight(9, 100), 0);
  }
});

test('the driving model runs the real road: its bends and its hills', () => {
  for (const track of [0, 1, 2]) {
    const course = arcadeDriveCourse(track), plan = arcadePlan(track)!;
    // One stretch of road from its lead-in to the end of its run-off; the three laps are distances along it.
    assert.equal(course.topology, 'sprint'); assert.equal(course.finish, length(track));
    assert.equal(course.stations[0], -100); assert.ok(course.stations.at(-1)! >= length(track) + 200);
    assert.equal(course.heading.length, plan.headings.length);
    for (const s of [0, 505, 2505, length(track) - 10]) {
      const i = Math.floor((s + 100) / 5), a = course.stations[i]!, b = course.stations[i + 1]!;
      const expected = (arcadeRoadHeight(track, b) - arcadeRoadHeight(track, a)) / 5;
      assert.ok(Math.abs(sampleCourse(course, s).grade - expected) < 1e-9, `track ${track} grade at ${s} m`);
    }
    // No bend tighter than 15 m, and the start line heads straight on.
    let tightest = Infinity;
    for (let s = -100; s < length(track) + 200; s += 5) tightest = Math.min(tightest, 1 / Math.max(1e-9, Math.abs(sampleCourse(course, s).kappa)));
    assert.ok(tightest > 14.8, `track ${track}: a bend of ${tightest.toFixed(1)} m`);
    assert.equal(courseHeading(course, 0), 0);
  }
  // Route 1 climbs hard past Tōnosawa and turns right round on itself at the Ōhiradai hairpin.
  const hakone = arcadeDriveCourse(0);
  assert.ok(sampleCourse(hakone, 1500).grade > .04);
  const turn = courseHeading(hakone, 4320) - courseHeading(hakone, 3980);
  assert.ok(Math.abs(turn) > Math.PI * .8, `the hairpin turns ${(turn * 180 / Math.PI).toFixed(0)}°`);
});

test('places follow the real road in order, each landmark in its own stretch', () => {
  for (const track of [0, 1, 2]) {
    const stretches = ARCADE_1986_STRETCHES[track]!;
    stretches.forEach((item, i) => { if (i) assert.ok(item.to > stretches[i - 1]!.to, `track ${track}: ${item.place} is out of order`); });
    assert.equal(stretches.at(-1)!.to, Infinity);
    for (const landmark of ARCADE_1986_LANDMARKS[track]!) {
      assert.ok(landmark.p > -100 && landmark.p < length(track) + 500, `${landmark.kind} stands on the course`);
      // A building never stands in the water or in forest; the liner lies beyond the park's lawns, the Tarō-sugi is
      // itself a forest tree, and Ōsanbashi is a pier: it runs out from the quay.
      const district = arcadeDistrictAt(track, landmark.p, landmark.side);
      if (landmark.kind === 'osanbashi') assert.equal(district, 'quay');
      else if (landmark.kind !== 'taro-sugi') assert.ok(!['quay', 'forest'].includes(district), `${landmark.kind} stands in ${district}`);
    }
    for (const crossing of ARCADE_1986_CROSSINGS[track]!) for (const landmark of ARCADE_1986_LANDMARKS[track]!)
      assert.ok(Math.abs(crossing.p - landmark.p) > (crossing.half ?? 12) + landmark.length / 2, `${landmark.kind} stands in a river`);
  }
  // Hakone: the station at the start, the rock shed between the two bridges, the Fujiya beyond the line.
  assert.match(arcadePlaceAt(0, 20), /箱根湯本/); assert.match(arcadePlaceAt(0, 700), /函嶺洞門/); assert.match(arcadePlaceAt(0, 6280), /富士屋/);
  const shed = ARCADE_1986_STREET[0]!.galleries![0]!, [asahi, chitose] = ARCADE_1986_CROSSINGS[0]!;
  assert.ok(asahi!.p < shed.from && shed.to < chitose!.p);
  // The station on the right; Tōnosawa's ryokan on the river side (Fukuzumirō, Kansuirō) and Ichinoyu across from them.
  assert.deepEqual(ARCADE_1986_LANDMARKS[0]!.map(l => [l.kind, l.side]),
    [['yumoto-station', -1], ['fukuzumiro', 1], ['kansuiro', 1], ['ichinoyu', -1], ['fujiya', 1]]);
  // Yokohama: the sea on the left the whole way. Coming down from Shinkō-bashi the Customs' tower stands back across
  // the block on the right, then the Prefectural Office on Kaigan-dōri; Ōsanbashi runs out on the left.
  for (let p = 0; p < length(1); p += 25) assert.notEqual(arcadeDistrictAt(1, p, -1), 'quay');
  const yokohama = Object.fromEntries(ARCADE_1986_LANDMARKS[1]!.map(l => [l.kind, l]));
  assert.equal(yokohama.queen!.side, -1); assert.equal(yokohama.king!.side, -1); assert.equal(yokohama['new-grand']!.side, -1);
  assert.equal(yokohama.osanbashi!.side, 1); assert.ok(yokohama.queen!.clearance > 80, 'the Customs stands back across the block');
  assert.ok(yokohama.queen!.p < yokohama.king!.p && yokohama.king!.p < yokohama['new-grand']!.p && yokohama['new-grand']!.p < yokohama['marine-tower']!.p);
  // Not there in August 1986: Chinatown's present gate (1989), and "Jack" stands 200 m inland of the route.
  assert.ok(!('zenrinmon' in yokohama) && !('jack' in yokohama));
  // Nikkō: both stations on the right, City Hall on the left, Shinkyō where the main street ends.
  const nikko = Object.fromEntries(ARCADE_1986_LANDMARKS[2]!.map(l => [l.kind, l]));
  assert.equal(nikko['nikko-station']!.side, -1); assert.equal(nikko['tobu-nikko-station']!.side, -1); assert.equal(nikko['nikko-city-hall']!.side, 1);
  assert.equal(ARCADE_1986_CROSSINGS[2]![0]!.kind, 'shinkyo');
  assert.ok(Math.abs(ARCADE_1986_CROSSINGS[2]![0]!.p - 1830) < 30);
  // No cherry avenue along the main street.
  assert.ok(ARCADE_1986_STREET[2]!.blossom!.every(([from]) => from > 1740));
});

test('the land beside the road eases from hill to valley without a step', () => {
  for (const track of [0, 1, 2]) for (const side of [-1, 1] as const) {
    for (let p = -100; p < length(track) + 500; p += 5)
      assert.ok(Math.abs(arcadeBankAt(track, p + 5, side) - arcadeBankAt(track, p, side)) < .12, `track ${track} side ${side} at ${p} m`);
  }
  // Above Tōnosawa the gorge falls away on the right and Sengen-yama's flank rises on the left.
  assert.ok(arcadeBankAt(0, 3000, -1) < -.5 && arcadeBankAt(0, 3000, 1) > 1.5);
  setTerrainRelief((p, side) => arcadeBankAt(0, p, side));
  try {
    assert.ok(terrainHeightAt(80, 3000, -1) < -8, 'the valley side falls below the road');
    assert.ok(terrainHeightAt(80, 3000, 1) > 16, 'the hill side stands over it');
    // The level strip before the banks keeps the road's own height.
    assert.ok(Math.abs(terrainHeightAt(18, 3000, -1)) < .5 && Math.abs(terrainHeightAt(18, 3000, 1)) < .5);
  } finally { setTerrainRelief(null); }
  assert.ok(terrainHeightAt(80, 3000, -1) > 5, 'other courses keep their plain banks');
});

test('the generated profiles are built from the traced roads in the research folder', () => {
  const built = JSON.parse(readFileSync('src/game/generated/arcade-roads.json', 'utf8')) as { courses: { track: number; road: string; startM: number; lengthM: number }[] };
  for (const course of built.courses) {
    const road = JSON.parse(readFileSync(`world/research/arcade/${course.road}.road.json`, 'utf8')) as { lengthM: number; stations: number[][] };
    assert.equal(course.lengthM, length(course.track));
    // The traced road reaches from the start line to the finish.
    assert.ok(course.startM >= 100 && road.lengthM >= course.startM + course.lengthM, `${course.road} covers the course`);
    assert.equal(road.stations.length, Math.floor(road.lengthM / 5) + 1);
  }
});
