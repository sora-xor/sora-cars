import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { publishedStreetBundle } from './helpers/published-street';
import { createUrbanGround } from '../src/game/three/urban-ground';
import { createGroundHeightSampler } from '../src/game/three/ground-sampler';
import { createPeriodCityLayout, moatWidth, MOAT, periodCityGroundCut, periodCityOpenRuns, periodCityPlantingClear,
  periodCityChunksNear, poseAt, TOKYO_1986_CROSSINGS, TOKYO_1986_DISTRICTS, type PeriodDistrict, type PeriodFootprint,
  type PeriodSide } from '../src/game/three/period-city/layout';
import { CityMeshBuilder } from '../src/game/three/period-city/geometry';
import { buildLot, type CityFixture } from '../src/game/three/period-city/buildings';
import { buildOpenGround } from '../src/game/three/period-city/open-ground';
import { buildStreet, streetCrossings } from '../src/game/three/period-city/street';
import { PeriodPeople } from '../src/game/three/period-city/people';
import { SPRITE_ATLAS, SPRITE_BASELINE, SPRITE_CELL, SPRITE_ROWS } from '../src/game/three/period-city/street-sprites';
import { readFileSync } from 'node:fs';
import pngjs from 'pngjs';
import { neonFor, noboriFor } from '../src/game/three/period-city/nightlife';
import { SORA_NEON, SORA_NOBORI, VNEON_TOP_V } from '../src/game/three/period-city/signs';
import { PeriodSky } from '../src/game/three/period-city/sky';
import { TRACKS, curvature } from '../src/game/rules';
import { arcadeDistrictAt, ARCADE_1986_CROSSINGS, ARCADE_1986_LANDMARKS, TOKYO_1986_LANDMARKS, TOKYO_1986_STREET, landmarkFootprint, seeded } from '../src/game/three/period-city/layout';

const published = publishedStreetBundle();
const samples = published.track.samples;
const poses = samples.map(s => ({
  p: s.progressMm! / 1000, x: -s.eastMm! / 1000, z: s.northMm! / 1000, y: s.elevationMm! / 1000,
  heading: -s.headingMicroturn! * Math.PI * 2 / 1e6, width: s.halfWidthMm! / 1000,
}));
const course = { length: published.track.lengthMm / 1000, circuit: true, poses };
const sectorAt = (p: number) => {
  let sector = samples[0]!.sector!;
  for (const s of samples) { if (s.progressMm! / 1000 > p) break; sector = s.sector!; }
  return sector;
};
const districtAt = (p: number, side: PeriodSide): PeriodDistrict => {
  const row = TOKYO_1986_DISTRICTS[sectorAt(p)]!;
  return side < 0 ? row.right : row.left;
};
const open = periodCityOpenRuns(course, districtAt);
const cut = periodCityGroundCut(course, open, TOKYO_1986_CROSSINGS);
const ground = createUrbanGround(poses, new THREE.MeshBasicMaterial(), cut);
const groundHeightAt = createGroundHeightSampler(ground);
const options = { districtAt, groundHeightAt, open, crossings: TOKYO_1986_CROSSINGS };
const layout = createPeriodCityLayout(course, options);

function corners(f: PeriodFootprint): THREE.Vector2[] {
  return [-1, 1].flatMap(x => [-1, 1].map(z => new THREE.Vector2(
    f.x + Math.cos(f.yaw) * f.halfX * x + Math.sin(f.yaw) * f.halfZ * z,
    f.z - Math.sin(f.yaw) * f.halfX * x + Math.cos(f.yaw) * f.halfZ * z)));
}
// Independent polygon projections, rather than the planner's own SAT helper.
function separated(a: PeriodFootprint, b: PeriodFootprint): boolean {
  const ca = corners(a), cb = corners(b);
  return [ca, cb].some(points => [1, 2].some(i => {
    const edge = points[i]!.clone().sub(points[0]!), axis = new THREE.Vector2(-edge.y, edge.x).normalize();
    const pa = ca.map(p => p.dot(axis)), pb = cb.map(p => p.dot(axis));
    return Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6;
  }));
}

test('the period city lays out the same Tokyo every time', () => {
  const again = createPeriodCityLayout(course, options);
  assert.equal(again.lots.length, layout.lots.length);
  assert.deepEqual(again.lots.map(l => [l.id, l.typology, l.width, l.storeys]), layout.lots.map(l => [l.id, l.typology, l.width, l.storeys]));
  assert.ok(layout.lots.length > 500, `only ${layout.lots.length} lots`);
});

test('no two buildings overlap and none stands on the road or its sidewalk', () => {
  const lots = layout.lots;
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
    const a = lots[i]!.footprint, b = lots[j]!.footprint;
    if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.halfX, a.halfZ) + Math.hypot(b.halfX, b.halfZ)) continue;
    assert.ok(separated(a, b), `${lots[i]!.id} overlaps ${lots[j]!.id}`);
  }
  for (const lot of lots) for (const corner of corners(lot.footprint)) for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1]!, b = poses[i]!, d = new THREE.Vector2(b.x - a.x, b.z - a.z);
    const t = THREE.MathUtils.clamp(corner.clone().sub(new THREE.Vector2(a.x, a.z)).dot(d) / d.lengthSq(), 0, 1);
    const distance = corner.distanceTo(new THREE.Vector2(a.x + d.x * t, a.z + d.y * t));
    assert.ok(distance >= Math.max(a.width, b.width) + 1.67, `${lot.id} reaches the sidewalk (${distance.toFixed(2)} m)`);
  }
});

test('the palace side stays open: moats, Kitanomaru and the shrine front carry no lots', () => {
  const moats = open.filter(run => run.district === 'moat');
  assert.ok(moats.length >= 2 && moats.every(run => run.side === 1), 'moats run along the left (palace) side');
  assert.ok(moats.reduce((sum, run) => sum + run.end - run.start, 0) > 4000, 'most of the left side is moat');
  for (const lot of layout.lots) assert.ok(!open.some(run => run.side === lot.side && lot.p >= run.start + 12 && lot.p <= run.end - 12 && lot.row === 1),
    `${lot.id} stands in an open district`);
  // The cut removes the paved ground over the water, never the road beside it.
  const run = moats[0]!, p = (run.start + run.end) / 2, at = poseAt(course, p);
  const point = (e: number) => [at.x + Math.cos(at.heading) * (at.width + e), at.z - Math.sin(at.heading) * (at.width + e)] as const;
  assert.equal(cut(...point(MOAT.water + moatWidth(p) / 2)), true);
  assert.equal(cut(...point(.5)), false);
  assert.equal(groundHeightAt(...point(MOAT.water + moatWidth(p) / 2)), null);
});

test('districts give each sector its own 1986 character, with little repetition', () => {
  const kanda = layout.lots.filter(lot => lot.district === 'kanda');
  const government = layout.lots.filter(lot => lot.district === 'government' && lot.row === 1);
  assert.ok(kanda.some(l => l.typology === 'shophouse') && kanda.some(l => l.typology === 'zakkyo'), 'Kanda mixes shop-houses and tenant buildings');
  assert.ok(government.filter(l => l.typology === 'ministry').length >= 3, 'ministries line Kasumigaseki');
  // Marunouchi's 31 m line: no frontage office above nine storeys.
  assert.ok(layout.lots.filter(l => l.row === 1 && l.typology === 'office').every(l => l.storeys <= 9));
  const seeds = new Set(layout.lots.map(l => l.seed));
  assert.equal(seeds.size, layout.lots.length, 'every lot has its own seed');
  const shapes = new Set(layout.lots.map(l => `${l.typology}:${l.width.toFixed(1)}:${l.depth.toFixed(1)}:${l.storeys}`));
  assert.ok(shapes.size > layout.lots.length * .97, `${shapes.size} distinct envelopes for ${layout.lots.length} lots`);
  assert.ok(new Set(layout.lots.map(l => l.typology)).size >= 8);
});

test('Kanda keeps a continuous street wall on both sides', () => {
  for (const side of [-1, 1] as const) {
    const frontage = layout.lots.filter(l => l.side === side && l.row === 1 && l.district === 'kanda' && l.p > 40 && l.p < 300)
      .reduce((sum, l) => sum + l.width, 0);
    assert.ok(frontage > 260 * .55, `side ${side}: ${frontage.toFixed(0)} m of frontage in 260 m`);
  }
});

test('the expressway crossing keeps its river corridor clear', () => {
  const crossing = TOKYO_1986_CROSSINGS[0]!, at = poseAt(course, crossing.p);
  for (const e of [20, 60]) for (const side of [-1, 1]) {
    const x = at.x + Math.cos(at.heading) * side * (at.width + e), z = at.z - Math.sin(at.heading) * side * (at.width + e);
    assert.equal(periodCityPlantingClear(layout, x, z, 1), false, 'the corridor is reserved');
    assert.equal(cut(x, z), true, 'the river replaces the ground');
  }
});

test('each chunk builds finite, budgeted geometry and shop lights', () => {
  let worst = 0, fixtures = 0;
  for (const key of periodCityChunksNear(layout, 0, 110, 7013)) {
    const lots = layout.chunks.get(key) ?? [], builder = new CityMeshBuilder(lots[0]?.x ?? 0, lots[0]?.z ?? 0), lights: CityFixture[] = [];
    for (const lot of lots) buildLot(builder, lot, lights);
    buildOpenGround(builder, layout, key * layout.chunkLength, (key + 1) * layout.chunkLength);
    buildStreet(builder, layout, key * layout.chunkLength, (key + 1) * layout.chunkLength);
    worst = Math.max(worst, builder.triangles); fixtures += lights.length;
    for (const geometry of builder.finish().values()) {
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) assert.ok(Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i)));
      geometry.dispose();
    }
  }
  assert.ok(worst < 90000, `a chunk built ${worst} triangles`);
  assert.ok(fixtures > 100, 'shop fronts light the pavement');
});

// Arcade: the same presentation geometry RaceWorld builds (three laps unrolled).
function arcade(id: number) {
  const track = TRACKS[id]!, poses: { p: number; x: number; y: number; z: number; heading: number; width: number }[] = [];
  let x = 0, z = -100, heading = 0;
  for (let p = -100; p <= track.length / 1000 * 3 + 500; p += 5) {
    poses.push({ x, y: 0, z, heading, width: 6, p });
    heading -= curvature(track, Math.max(0, p * 1000)) * 5 / 760;
    x += Math.sin(heading) * 5; z += Math.cos(heading) * 5;
  }
  const arcadeCourse = { length: track.length / 1000 * 3, circuit: false, poses };
  const districtAt = (p: number, side: PeriodSide) => arcadeDistrictAt(id, p, side);
  return { course: arcadeCourse, layout: createPeriodCityLayout(arcadeCourse, { districtAt, groundHeightAt: () => -.08,
    crossings: ARCADE_1986_CROSSINGS[id], landmarks: ARCADE_1986_LANDMARKS[id] }) };
}

test('Arcade towns: onsen Hakone, harbour Yokohama and old Nikko, clear of the road and of each other', () => {
  const kinds = [new Set(['ryokan', 'hotel']), new Set(['warehouse', 'containers']), new Set(['machiya', 'ryokan'])];
  for (const id of [0, 1, 2]) {
    const { course: c, layout: l } = arcade(id);
    assert.ok(l.lots.length > 150, `track ${id}: ${l.lots.length} lots`);
    assert.ok(l.lots.some(lot => kinds[id]!.has(lot.typology)), `track ${id} has its period typologies`);
    for (let i = 0; i < l.lots.length; i++) for (let j = i + 1; j < l.lots.length; j++) {
      const a = l.lots[i]!.footprint, b = l.lots[j]!.footprint;
      if (Math.hypot(a.x - b.x, a.z - b.z) <= Math.hypot(a.halfX, a.halfZ) + Math.hypot(b.halfX, b.halfZ))
        assert.ok(separated(a, b), `track ${id}: ${l.lots[i]!.id} overlaps ${l.lots[j]!.id}`);
    }
    for (const lot of l.lots) for (const corner of corners(lot.footprint)) for (let i = 1; i < c.poses.length; i++) {
      const a = c.poses[i - 1]!, b = c.poses[i]!, d = new THREE.Vector2(b.x - a.x, b.z - a.z);
      const t = THREE.MathUtils.clamp(corner.clone().sub(new THREE.Vector2(a.x, a.z)).dot(d) / d.lengthSq(), 0, 1);
      assert.ok(corner.distanceTo(new THREE.Vector2(a.x + d.x * t, a.z + d.y * t)) >= 6 + 1.67, `track ${id}: ${lot.id} reaches the road`);
    }
    // Forests and quays stay open; landmarks keep their ground.
    for (const lot of l.lots) assert.ok(!['forest', 'quay'].includes(lot.district));
    for (const landmark of l.landmarks) {
      const f = landmarkFootprint(c, landmark);
      assert.ok(l.lots.every(lot => separated(lot.footprint, f)), `track ${id}: a lot stands on the ${landmark.kind}`);
    }
  }
  const harbour = arcade(1).layout;
  const quays = harbour.open.filter(run => run.district === 'quay');
  assert.ok(quays.length >= 3 && quays.every(run => run.side === 1), 'Yokohama opens onto the water on the left');
});

test('Arcade chunks build finite geometry, landmarks included', () => {
  for (const id of [1, 2]) {
    const { layout: l } = arcade(id);
    for (const p of [...l.landmarks.map(x => x.p), ...l.crossings.map(x => x.p)]) {
      const key = Math.floor(p / l.chunkLength), lots = l.chunks.get(key) ?? [];
      const builder = new CityMeshBuilder(lots[0]?.x ?? 0, lots[0]?.z ?? 0);
      for (const lot of lots) buildLot(builder, lot, []);
      buildOpenGround(builder, l, key * l.chunkLength, (key + 1) * l.chunkLength);
      assert.ok(builder.triangles > 500, `track ${id} chunk ${key} drew its landmark`);
      for (const geometry of builder.finish().values()) {
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) assert.ok(Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i)));
      }
    }
  }
});

test('1986 landmarks keep clear of the route and of every lot', () => {
  const tokyo = createPeriodCityLayout(course, { ...options, landmarks: TOKYO_1986_LANDMARKS });
  for (const l of tokyo.landmarks) {
    const f = landmarkFootprint(course, l);
    assert.ok(tokyo.lots.every(lot => separated(lot.footprint, f)), `a lot stands on the ${l.kind}`);
    for (const corner of corners(f)) for (let i = 1; i < poses.length; i++) {
      const a = poses[i - 1]!, b = poses[i]!, d = new THREE.Vector2(b.x - a.x, b.z - a.z);
      const t = THREE.MathUtils.clamp(corner.clone().sub(new THREE.Vector2(a.x, a.z)).dot(d) / d.lengthSq(), 0, 1);
      assert.ok(corner.distanceTo(new THREE.Vector2(a.x + d.x * t, a.z + d.y * t)) >= Math.max(a.width, b.width) + 1.67,
        `the ${l.kind} reaches the road`);
    }
  }
  // Each builds finite geometry in its own chunk.
  for (const l of tokyo.landmarks) {
    const key = Math.floor(l.p / tokyo.chunkLength), builder = new CityMeshBuilder(0, 0);
    buildOpenGround(builder, tokyo, key * tokyo.chunkLength, (key + 1) * tokyo.chunkLength);
    assert.ok(builder.triangles > 200, `the ${l.kind} drew`);
    for (const geometry of builder.finish().values()) geometry.dispose();
  }
});

// The street life: crowds, neon, nobori and SORA's banners.
const street = createPeriodCityLayout(course, { ...options, landmarks: TOKYO_1986_LANDMARKS, street: TOKYO_1986_STREET });
/** Progress where both sides are the given district for at least 120 m. */
function stretch(kind: PeriodDistrict): number {
  for (let p = 0; p < course.length; p += 20)
    if ([0, 40, 80, 120].every(d => districtAt(p + d, -1) === kind && districtAt(p + d, 1) === kind)) return p;
  throw new Error(`no ${kind} stretch`);
}
/** Signed distance beyond the road edge of a world point, measured to the centre line between poses. */
function beyondEdge(x: number, z: number): number {
  let best = Infinity, beyond = 0;
  for (let i = 0; i < poses.length - 1; i++) {
    const a = poses[i]!, b = poses[i + 1]!, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; beyond = d - (a.width + (b.width - a.width) * t); }
  }
  return beyond;
}

test('crowds keep to the pavements, throng Kanda and walk with the clock', () => {
  const people = new PeriodPeople(), at = new THREE.Vector3(), matrix = new THREE.Matrix4();
  const positions = () => Array.from({ length: people.mesh.count }, (_, i) => {
    people.mesh.getMatrixAt(i, matrix); return at.setFromMatrixPosition(matrix).toArray();
  });
  const kanda = stretch('kanda');
  people.update(street, kanda, 12.5);
  const first = positions();
  assert.ok(first.length > 60, `only ${first.length} people in Kanda`);
  for (const [x, , z] of first) assert.ok(beyondEdge(x!, z!) > .85, 'a pedestrian stands on the road or behind the guard rail');
  people.update(street, kanda, 12.5);
  assert.deepEqual(positions(), first, 'the same clock places the same crowd');
  people.update(street, kanda, 14);
  assert.ok(positions().some((p, i) => Math.hypot(p[0]! - first[i]![0]!, p[2]! - first[i]![2]!) > .5), 'walkers move');
  people.update(street, stretch('government'), 12.5);
  assert.ok(people.mesh.count < first.length / 2, 'Kasumigaseki is quieter than Kanda');
  people.update(null, kanda, 12.5);
  assert.equal(people.mesh.count, 0);
});

test('people wait at every zebra crossing in town', () => {
  const crossings = streetCrossings(street);
  assert.ok(crossings.length >= 6, `${crossings.length} crossings`);
  assert.deepEqual(streetCrossings(street), crossings);
  const people = new PeriodPeople(), at = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const c of crossings) {
    people.update(street, c - 30, 3);
    const crossing = poseAt(course, c);
    let waiting = 0;
    for (let i = 0; i < people.mesh.count; i++) {
      people.mesh.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix);
      if (Math.hypot(at.x - crossing.x, at.z - crossing.z) < crossing.width + 6) waiting++;
    }
    assert.ok(waiting >= 3, `only ${waiting} waiting at the crossing at ${c}`);
  }
});

test('Kanda flies neon, nobori and SORA banners across the street, within the chunk budget', () => {
  const kanda = stretch('kanda'), keys = [0, 1, 2, 3].map(i => Math.floor(kanda / street.chunkLength) + i);
  const used = new Set<string>();
  let banners = 0;
  for (const key of keys) {
    const lots = street.chunks.get(key) ?? [], builder = new CityMeshBuilder(lots[0]?.x ?? 0, lots[0]?.z ?? 0);
    for (const lot of lots) buildLot(builder, lot, []);
    buildStreet(builder, street, key * street.chunkLength, (key + 1) * street.chunkLength);
    assert.ok(builder.triangles < 90000);
    for (const [material, geometry] of builder.finish()) { used.add(material); geometry.dispose(); }
  }
  assert.ok(used.has('neon') && used.has('flag'), `materials: ${[...used].join(', ')}`);
  // Across the whole lap: banners strung over the road (a cloth wider than 4 m).
  const builder = new CityMeshBuilder(0, 0), front = builder.front.bind(builder);
  builder.front = (key, x0, x1, y0, y1, z, facing) => { if (key === 'flag' && x1 - x0 > 4) banners++; front(key, x0, x1, y0, y1, z, facing); };
  for (let p = 0; p < course.length; p += street.chunkLength) { buildStreet(builder, street, p, p + street.chunkLength); builder.finish(); }
  assert.ok(banners >= 10, `${banners} street banners`);
});

test('SORA flies on about a quarter of the nobori and a seventh of the neon', () => {
  const random = seeded(1986);
  let nobori = 0, neon = 0;
  for (let i = 0; i < 4000; i++) {
    if (SORA_NOBORI.includes(noboriFor('kanda', random))) nobori++;
    if (neonFor('kanda', random) === SORA_NEON) neon++;
  }
  assert.ok(nobori > 800 && nobori < 1300, `${nobori} SORA nobori`);
  assert.ok(neon > 400 && neon < 750, `${neon} SORA neon`);
});

test('the sprite crowd brings each district its people: salarymen, police, schoolgirls, bosozoku, cats, fans and cyclists', () => {
  const rows = (layout: Parameters<PeriodPeople['update']>[0], length: number, from = 0) => {
    const people = new PeriodPeople(), seen = new Set<string>();
    for (let p = from; p < length; p += 50) {
      people.update(layout, p, p / 7);
      const cell = people.mesh.geometry.getAttribute('spriteA');
      for (let i = 0; i < people.mesh.count; i++) seen.add(SPRITE_ROWS[cell.getX(i)]!.name);
    }
    return seen;
  };
  const tokyo = rows(street, course.length);
  for (const name of ['salaryman', 'office-lady', 'police-signal', 'schoolgirl', 'schoolboy', 'fan-cheer', 'crew', 'rider-housewife'])
    assert.ok(tokyo.has(name), `no ${name} on the Tokyo loop (${[...tokyo].join(', ')})`);
  assert.ok([...tokyo].some(name => name.startsWith('bosozoku')), 'no bosozoku gang in Kanda');
  assert.ok(['calico', 'orange-tabby', 'black-cat'].some(cat => tokyo.has(cat)), 'no cats in Tokyo');
  const towns = [['yukata-woman', 'yukata-man'], ['dock'], ['tourist']] as const;
  for (const id of [0, 1, 2]) {
    const { course: c, layout } = arcade(id), seen = rows(layout, c.length, 0);
    assert.ok(towns[id]!.some(name => seen.has(name)), `Arcade ${id}: ${[...seen].join(', ')}`);
  }
});

test('the shipped sprite atlas has every frame the shader picks, each standing on the baseline', () => {
  const atlas = pngjs.PNG.sync.read(readFileSync(new URL('../public/assets/sprites/street-people.png', import.meta.url)));
  assert.equal(atlas.width, SPRITE_ATLAS.width); assert.equal(atlas.height, SPRITE_ATLAS.height);
  /** Opaque pixels in a cell, and its lowest opaque row. */
  const cell = (row: number, column: number, wide: boolean) => {
    let count = 0, lowest = -1;
    for (let y = 0; y < SPRITE_CELL.height; y++) for (let x = 0; x < SPRITE_CELL.width * (wide ? 2 : 1); x++)
      if (atlas.data[((row * SPRITE_CELL.height + y) * atlas.width + column * SPRITE_CELL.width + x) * 4 + 3]! > 0) { count++; lowest = y; }
    return { count, lowest };
  };
  const frames: Record<string, readonly (readonly [number, boolean])[]> = {
    walker: Array.from({ length: 15 }, (_, c) => [c, false] as const), cheer: [0, 2, 4, 6, 8, 10, 12, 14].map(c => [c, true] as const),
    squat: [0, 1, 2, 3].map(c => [c, false] as const), signal: [0, 2, 4, 6, 8, 10].map(c => [c, true] as const),
    cat: Array.from({ length: 8 }, (_, c) => [c, false] as const), rider: [[0, true], [2, true], [4, true], [6, true], [8, false], [9, false], [10, false], [11, false]],
    bike: [[0, true], [2, false], [3, false]],
  };
  SPRITE_ROWS.forEach(({ name, layout }, row) => {
    for (const [column, wide] of frames[layout]!) {
      const { count, lowest } = cell(row, column, wide);
      assert.ok(count > (layout === 'cat' ? 40 : 300), `${name} frame ${column} is empty (${count})`);
      assert.ok(Math.abs(lowest - SPRITE_BASELINE) <= 1, `${name} frame ${column} stands on row ${lowest}`);
    }
  });
});

test('neon spells itself out: Kanda hangs tall vertical neon, and many signs light letter by letter', () => {
  const kanda = stretch('kanda');
  let vertical = 0, spelled = 0, faces = 0;
  for (let key = Math.floor(kanda / street.chunkLength); key < Math.floor(kanda / street.chunkLength) + 4; key++) {
    const lots = street.chunks.get(key) ?? [], builder = new CityMeshBuilder(lots[0]?.x ?? 0, lots[0]?.z ?? 0);
    for (const lot of lots) buildLot(builder, lot, []);
    const neon = builder.finish().get('neon');
    if (!neon) continue;
    const uv = neon.getAttribute('uv'), colour = neon.getAttribute('color');
    for (let i = 0; i < colour.count; i += 6) {
      faces++;
      if (colour.getY(i) > 1.5) spelled++;
      if (uv.getY(i) < VNEON_TOP_V) vertical++;
    }
  }
  assert.ok(vertical >= 2, `${vertical} vertical neon faces`);
  assert.ok(spelled >= faces / 6, `${spelled} of ${faces} neon faces spell themselves out`);
});

test('the sky flies ad balloons over tall roofs and searchlights from club roofs, moving with the clock', () => {
  const sky = new PeriodSky(street, null), camera = new THREE.Vector3(), at = new THREE.Matrix4(), first: number[] = [];
  const { balloons, searchlights } = sky.counts;
  assert.ok(balloons >= 3, `${balloons} ad balloons on the loop`);
  assert.ok(searchlights >= 1, `${searchlights} searchlights`);
  const spheres = sky.group.getObjectByName('Ad balloons') as THREE.InstancedMesh;
  sky.update(camera, 0, 10, 1);
  for (let i = 0; i < spheres.count; i++) { spheres.getMatrixAt(i, at); first.push(...new THREE.Vector3().setFromMatrixPosition(at).toArray()); }
  // Each balloon rides 20 m and more above the street.
  for (let i = 0; i < spheres.count; i++) {
    const y = first[i * 3 + 1]!, near = poses.reduce((best, pose) => Math.hypot(pose.x - first[i * 3]!, pose.z - first[i * 3 + 2]!)
      < Math.hypot(best.x - first[i * 3]!, best.z - first[i * 3 + 2]!) ? pose : best);
    assert.ok(y - near.y > 20, `balloon ${i} at ${(y - near.y).toFixed(1)} m`);
  }
  sky.update(camera, 0, 10, 1);
  const again: number[] = [];
  for (let i = 0; i < spheres.count; i++) { spheres.getMatrixAt(i, at); again.push(...new THREE.Vector3().setFromMatrixPosition(at).toArray()); }
  assert.deepEqual(again, first, 'the same clock flies the same sky');
  sky.update(camera, 0, 14, 1);
  spheres.getMatrixAt(0, at);
  assert.ok(new THREE.Vector3().setFromMatrixPosition(at).distanceTo(new THREE.Vector3(first[0], first[1], first[2])) > .05, 'balloons sway');
  sky.dispose();
});
