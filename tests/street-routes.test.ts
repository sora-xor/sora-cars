import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileStreetTrack, type AuthoredStreetTrack } from '../scripts/lib/street-track-compiler';
import { compileStreetObjects, type AuthoredStreetObjects } from '../scripts/lib/street-object-compiler';
import { LEDGER_STREET_ROUTE, STREET_ROUTE_IDS, streetRouteAuthoring, streetRoutePackage } from '../scripts/lib/street-routes';
import { STREET_ASSET_MANIFEST } from '../src/game/street/asset-manifest';
import { streetPresentation } from '../src/game/street/presentation';
import { STREET_ROUTE_STYLES, streetRouteStyle } from '../src/game/street/routes';
import { STREET_ROUTE_SONGS, composeStreetSong, streetSongSectionsMs } from '../src/game/street/route-songs';
import * as THREE from 'three';
import { streetScene } from '../src/game/three/period-city/street-scenes';
import { createPeriodCityLayout, landmarkFootprint, periodCityForestVegetationGround, periodCityGroundCut, periodCityOpenRuns,
  type PeriodDistrict, type PeriodFootprint, type PeriodSide } from '../src/game/three/period-city/layout';
import { PeriodPeople } from '../src/game/three/period-city/people';
import { SPRITE_ROWS } from '../src/game/three/period-city/street-sprites';
import { IROHA } from '../src/game/three/period-city/signs';
import { FarLand, farLandHeights, FAR_LAND_METRES_PER_DEGREE } from '../src/game/three/period-city/far-land';
import { CityMeshBuilder } from '../src/game/three/period-city/geometry';
import { buildStreet } from '../src/game/three/period-city/street';
import { FLORA_KIND, FLORA_STRIDE, floraMeshes } from '../src/game/three/period-city/flora';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const routes = STREET_ROUTE_IDS.map(id => {
  const files = streetRouteAuthoring(id), track = compileStreetTrack(read(files.track) as AuthoredStreetTrack);
  return { id, track, objects: compileStreetObjects(track, read(files.objects) as AuthoredStreetObjects) };
});

test('the catalog lists Tokyo first and each route once', () => {
  assert.equal(STREET_ROUTE_IDS[0], LEDGER_STREET_ROUTE);
  assert.equal(new Set(STREET_ROUTE_IDS).size, STREET_ROUTE_IDS.length);
  for (const { id, track } of routes) assert.equal(track.id, id);
});

test('a car can steer every bend of every route on its widest line', () => {
  // Native steering turns a car at most clamp(9000 − 2v, 1800, 9000) × min(v, 600) / 600 microturns a tick,
  // so no car holds a path tighter than about 10.6 m. In every 5 m cell the widest line (the centreline radius
  // plus the half-width less the car's 900 mm half-width) must stay above 12 m, which allows about 55 km/h.
  for (const { id, track } of routes) {
    const s = track.samples;
    for (let i = 0; i + 1 < s.length; i++) {
      const turn = Math.abs(s[i + 1]!.headingMicroturn - s[i]!.headingMicroturn);
      if (!turn) continue;
      const radius = (s[i + 1]!.progressMm - s[i]!.progressMm) * 1e6 / (2 * Math.PI * turn);
      const line = radius + Math.min(s[i]!.halfWidthMm, s[i + 1]!.halfWidthMm) - 900;
      assert.ok(line >= 12000, `${id} at ${(s[i]!.progressMm / 1000).toFixed(0)} m: widest line ${(line / 1000).toFixed(1)} m`);
    }
  }
});

test('every route has its own wording, chapters for each soundtrack cue, and menu names', () => {
  for (const { id, track } of routes) {
    const style = streetRouteStyle(id);
    assert.equal(style.id, id, `${id} has a presentation style`);
    assert.equal(style.chapters.length, track.sound.cuesMs.length, `${id} titles every cue`);
    for (const [index, cue] of track.sound.cuesMs.entries()) {
      const chapter = streetPresentation(track, Math.ceil(cue * 30 / 1000));
      assert.equal(chapter.index, index); assert.equal(chapter.english, style.chapters[index]!.english);
    }
    assert.ok(streetRoutePackage(id).japanese && streetRoutePackage(id).name);
  }
  assert.equal(STREET_ROUTE_STYLES.length, new Set(STREET_ROUTE_STYLES.map(style => style.id)).size);
});

test('every route has a scene that dresses each of its sectors', () => {
  for (const { id, track } of routes) {
    const scene = streetScene(id);
    assert.ok(scene, `${id} has a scene`);
    for (const sector of new Set(track.samples.map(sample => sample.sector))) assert.ok(scene.districts[sector], `${id} sector ${sector}`);
    for (const landmark of scene.landmarks) assert.ok(landmark.p >= 0 && landmark.p <= track.lengthMm / 1000, `${id} ${landmark.kind} lies on the route`);
    for (const marker of scene.street?.markers ?? []) assert.ok(IROHA.includes(marker.text), `${id} curve board ${marker.text}`);
    if (scene.mood.daylight !== 'dawn-arc') assert.equal(scene.mood.daylight.length, track.sound.cuesMs.length + 1, `${id} daylight keys`);
  }
});

test('the routes beyond Tokyo race to their own composed song, cued on its sections', () => {
  for (const { id, track } of routes.filter(route => route.id !== LEDGER_STREET_ROUTE)) {
    const song = STREET_ROUTE_SONGS.find(item => item.route === id);
    assert.ok(song, `${id} has a song`);
    assert.equal(track.sound.asset, `${id}.m4a`);
    const score = composeStreetSong(song), sections = streetSongSectionsMs(song, .08);
    assert.equal(score.beats, song.sections * 32);
    assert.ok(score.bpm >= 110 && score.bpm <= 170, `${id} races at ${score.bpm.toFixed(1)} bpm`);
    assert.ok(track.sound.cuesMs.slice(1).every(cue => sections.includes(cue)), `${id} cues fall on section starts`);
    assert.ok(Math.abs(track.sound.durationMs - (song.seconds + .08 + 1) * 1000) < 120, `${id} recording is the composed length`);
  }
});

test('packaged routes are catalog routes with wording', () => {
  for (const item of STREET_ASSET_MANIFEST) {
    assert.ok((STREET_ROUTE_IDS as readonly string[]).includes(item.id), `${item.id} is in the native catalog`);
    assert.equal(streetRouteStyle(item.id).id, item.id);
  }
});

test('each route brings its own locals: maiko in Gion, deer in Nara Park, monkeys on the Irohazaka guard rails, none in Tokyo', () => {
  const city = (id: string) => {
    const { track } = routes.find(route => route.id === id)!, scene = streetScene(id)!;
    const poses = track.samples.map(s => ({ p: s.progressMm / 1000, x: -s.eastMm / 1000, z: s.northMm / 1000, y: s.elevationMm / 1000,
      heading: -s.headingMicroturn * Math.PI * 2 / 1e6, width: s.halfWidthMm / 1000 }));
    const sectorAt = (p: number) => { let sector = track.samples[0]!.sector; for (const s of track.samples) { if (s.progressMm / 1000 > p) break; sector = s.sector; } return sector; };
    const layout = createPeriodCityLayout({ length: track.lengthMm / 1000, circuit: track.topology === 'circuit', poses }, { groundHeightAt: () => 0,
      districtAt: (p, side) => { const row = scene.districts[sectorAt(p)]!; return side < 0 ? row.right : row.left; },
      localsAt: p => scene.locals?.find(local => local.sectors.includes(sectorAt(p))) ?? null });
    /** Where a sector starts, in metres. */
    const start = (sector: number) => track.samples.find(s => s.sector === sector)!.progressMm / 1000;
    /** The sprites in view from `p`: their rows, actions and heights above the nearest road pose. */
    const view = (p: number, wetness = 0) => {
      const people = new PeriodPeople(), at = new THREE.Vector3(), matrix = new THREE.Matrix4();
      people.update(layout, p, 12.5, wetness);
      const cell = people.mesh.geometry.getAttribute('spriteA');
      return Array.from({ length: people.mesh.count }, (_, i) => {
        people.mesh.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix);
        const road = poses.reduce((best, pose) => Math.hypot(pose.x - at.x, pose.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z) ? pose : best);
        return { name: SPRITE_ROWS[cell.getX(i)]!.name, action: cell.getZ(i), lift: at.y - road.y };
      });
    };
    return { start, view, length: track.lengthMm / 1000 };
  };
  const nara = city('nara-1986');
  const park = [2, 3, 4, 5].flatMap(sector => nara.view(nara.start(sector)).filter(sprite => sprite.name.startsWith('deer')));
  assert.ok(park.length >= 20, `${park.length} deer in Nara Park`);
  for (const [action, what] of [[2, 'graze'], [3, 'bow'], [4, 'lie']] as const)
    assert.ok(park.some(deer => deer.action === action), `no deer ${what} in Nara Park`);
  assert.ok(park.some(deer => deer.name === 'deer-stag') && park.some(deer => deer.name === 'deer'), 'both stags and does');
  assert.equal(nara.view(0).filter(sprite => sprite.name.startsWith('deer')).length, 0, 'no deer at the station front');
  const kyoto = city('kyoto-1986'), gion = kyoto.start(5) - 40;
  assert.ok(kyoto.view(gion).filter(sprite => sprite.name === 'maiko').length >= 3, 'maiko walk in Gion');
  assert.ok(kyoto.view(gion, .85).some(sprite => sprite.name === 'umbrella-maiko'), 'maiko open a janome-gasa on a wet night');
  assert.equal(kyoto.view(kyoto.start(15) + 600).filter(sprite => sprite.name.includes('maiko')).length, 0, 'no maiko on Horikawa');
  const iroha = city('irohazaka-1986'), troop = [9, 10].flatMap(sector => iroha.view(iroha.start(sector)).filter(sprite => sprite.name.startsWith('monkey')));
  assert.ok(troop.length >= 6, `${troop.length} monkeys toward Akechidaira`);
  assert.ok(troop.some(monkey => Math.abs(monkey.lift - .84) < .05), 'some monkeys sit on the guard rail');
  const tokyo = city('tokyo-1986');
  for (let p = 0; p < tokyo.length; p += 200)
    assert.deepEqual(tokyo.view(p).filter(sprite => /maiko|deer|monkey/.test(sprite.name)), [], `no locals in Tokyo at ${p} m`);
});

test('far land fills the hill views of Nara and Aizu: lit basins, dark parks and castle grounds, always under the road', () => {
  const places = {
    'nara-1986': { floor: [34.6809, 135.8197, 66], ridge: [34.678, 135.6786, 550] },          // JNR Nara station; the Ikoma ridge
    'aizu-wakamatsu-1986': { floor: [37.50683, 139.93119, 214], ridge: [37.6012, 140.0723, 1500] }, // Aizu-Wakamatsu station; Bandai-san
  } as const;
  for (const [id, place] of Object.entries(places)) {
    const plan = streetScene(id)!.distant.find(item => item.land)?.land;
    assert.ok(plan, `${id} draws its far land`);
    const { grid, origin } = plan, heights = farLandHeights(grid), track = routes.find(route => route.id === id)!.track;
    const north = FAR_LAND_METRES_PER_DEGREE, east = north * Math.cos(origin.lat * Math.PI / 180);
    const latOf = (n: number) => origin.lat + n / north, lonOf = (e: number) => origin.lon + e / east;
    // Every point of the route lies well inside the grid.
    for (const s of track.samples) {
      const lat = latOf(s.northMm / 1000), lon = lonOf(s.eastMm / 1000);
      assert.ok(lat - grid.south > .09 && grid.north - lat > .09 && lon - grid.west > .1 && grid.east - lon > .1, `${id} ${(s.progressMm / 1000).toFixed(0)} m lies well inside the grid`);
    }
    const at = (lat: number, lon: number) => heights[Math.round((lat - grid.south) / (grid.north - grid.south) * (grid.rows - 1)) * grid.cols
      + Math.round((lon - grid.west) / (grid.east - grid.west) * (grid.cols - 1))]!;
    assert.ok(Math.abs(at(place.floor[0], place.floor[1]) - place.floor[2]) < 12, `${id}: the station stands on the basin floor`);
    assert.ok(at(place.ridge[0], place.ridge[1]) > place.ridge[2], `${id}: the far ridge rises`);
    // Within 130 m of the road the land stays at least 3 m under it, so the camera always looks down on it.
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
      const e = (grid.west + (grid.east - grid.west) * c / (grid.cols - 1) - origin.lon) * east, n = (grid.south + (grid.north - grid.south) * r / (grid.rows - 1) - origin.lat) * north;
      for (const s of track.samples) {
        if (Math.hypot(e - s.eastMm / 1000, n - s.northMm / 1000) < 130) assert.ok(heights[r * grid.cols + c]! <= s.elevationMm / 1000 - 3, `${id}: land at ${r},${c} stays under the road`);
      }
    }
    const land = new FarLand(plan), lights = (land.group.children.find(o => o instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position');
    assert.ok(land.lightCount > 2000, `${id}: ${land.lightCount} lights in the basin`);
    for (let i = 0; i < lights.count; i++) {
      const lat = latOf(lights.getZ(i)), lon = lonOf(-lights.getX(i));
      for (const park of plan.parks) assert.ok(Math.hypot((lon - park.lon) * east / park.rx, (lat - park.lat) * north / park.rz) > .8, `${id}: light ${i} lies in a park`);
    }
    land.dispose();
    // Past the hilltop finish the town paving stops, leaving the view to the far land.
    const scene = streetScene(id)!, poses = track.samples.map(s => ({ p: s.progressMm / 1000, x: -s.eastMm / 1000, z: s.northMm / 1000, y: s.elevationMm / 1000,
      heading: -s.headingMicroturn * Math.PI * 2 / 1e6, width: s.halfWidthMm / 1000 }));
    const sectorAt = (p: number) => { let sector = track.samples[0]!.sector; for (const s of track.samples) { if (s.progressMm / 1000 > p) break; sector = s.sector; } return sector; };
    const districtAt = (p: number, side: number) => { const row = scene.districts[sectorAt(p)]!; return side < 0 ? row.right : row.left; };
    const course = { length: track.lengthMm / 1000, circuit: false, poses }, cut = periodCityGroundCut(course, periodCityOpenRuns(course, districtAt), []);
    const finish = poses.at(-1)!;
    for (const d of [10, 50, 100]) assert.ok(cut(finish.x + Math.sin(finish.heading) * d, finish.z + Math.cos(finish.heading) * d), `${id}: no paving ${d} m past the finish`);
  }
});

test('Irohazaka climbs before its own mountains: Nantai-san over the climb, the valley always under the road', () => {
  const id = 'irohazaka-1986', plan = streetScene(id)!.distant.find(item => item.land)?.land;
  assert.ok(plan, 'Irohazaka draws its far land');
  const { grid, origin } = plan, heights = farLandHeights(grid), track = routes.find(route => route.id === id)!.track;
  const north = FAR_LAND_METRES_PER_DEGREE, east = north * Math.cos(origin.lat * Math.PI / 180);
  for (const s of track.samples) {
    const lat = origin.lat + s.northMm / 1000 / north, lon = origin.lon + s.eastMm / 1000 / east;
    assert.ok(lat - grid.south > .09 && grid.north - lat > .09 && lon - grid.west > .1 && grid.east - lon > .1, `${(s.progressMm / 1000).toFixed(0)} m lies well inside the grid`);
  }
  const at = (lat: number, lon: number) => heights[Math.round((lat - grid.south) / (grid.north - grid.south) * (grid.rows - 1)) * grid.cols
    + Math.round((lon - grid.west) / (grid.east - grid.west) * (grid.cols - 1))]!;
  assert.ok(at(36.7650, 139.4908) > 2300, 'Nantai-san rises over the climb');
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    const e = (grid.west + (grid.east - grid.west) * c / (grid.cols - 1) - origin.lon) * east, n = (grid.south + (grid.north - grid.south) * r / (grid.rows - 1) - origin.lat) * north;
    for (const s of track.samples) {
      if (Math.hypot(e - s.eastMm / 1000, n - s.northMm / 1000) < 130) assert.ok(heights[r * grid.cols + c]! <= s.elevationMm / 1000 - 3, `land at ${r},${c} stays under the road`);
    }
  }
  const land = new FarLand(plan);
  assert.ok(land.lightCount > 500, `${land.lightCount} lights in Nikko and Kiyotaki`);
  land.dispose();
});

test('the autumn wood, fallen leaves and shrubs lie only along a route\u2019s autumn stretches, on its hillside, the same however the chunks fall', () => {
  const { track } = routes.find(route => route.id === 'nara-1986')!, scene = streetScene('nara-1986')!;
  const [start] = scene.street!.litter![0]!;
  const poses = track.samples.map(s => ({ p: s.progressMm / 1000, x: -s.eastMm / 1000, z: s.northMm / 1000, y: s.elevationMm / 1000,
    heading: -s.headingMicroturn * Math.PI * 2 / 1e6, width: s.halfWidthMm / 1000 }));
  const course = { length: track.lengthMm / 1000, circuit: false, poses };
  const nearest = (x: number, z: number) => poses.reduce((best, pose) => Math.hypot(pose.x - x, pose.z - z) < Math.hypot(best.x - x, best.z - z) ? pose : best);
  const plain = { footbridges: [], guides: [] };
  // `fall`: how far the hillside lies below the road beyond its shoulder (0.2 m: level; 4 m: a valley side).
  const layout = (street: object, fall = .2) => createPeriodCityLayout(course, { groundHeightAt: (x, z) => nearest(x, z).y - fall,
    districtAt: () => 'forest', street: { ...plain, ...street } });
  const build = (l: ReturnType<typeof layout>, from: number, to: number) => {
    const b = new CityMeshBuilder(0, 0); buildStreet(b, l, from, to);
    const meshes = b.finish(), ground = meshes.get('ground'), position = ground?.getAttribute('position');
    const plants = Array.from({ length: b.flora.length / FLORA_STRIDE }, (_, i) => ({ kind: b.flora[i * FLORA_STRIDE]!, x: b.flora[i * FLORA_STRIDE + 1]!,
      y: b.flora[i * FLORA_STRIDE + 2]!, z: b.flora[i * FLORA_STRIDE + 3]! }));
    return { triangles: (position?.count ?? 0) / 3, low: position ? Math.min(...Array.from({ length: position.count }, (_, i) => position.getY(i))) : 0, plants,
      stone: (meshes.get('stone')?.getAttribute('position').count ?? 0) / 3 };
  };
  const autumn = { litter: [[start, start + 600]] }, littered = layout(autumn), bare = layout({});
  const before = build(littered, start - 160, start - 80);
  assert.equal(before.triangles, build(bare, start - 160, start - 80).triangles, 'no leaves before the maples');
  assert.equal(before.plants.length, 0, 'and no wood');
  const inside = build(littered, start + 400, start + 480);
  assert.ok(inside.triangles - build(bare, start + 400, start + 480).triangles > 80 * 20 * 2, `${inside.triangles} triangles of leaves and shrubs in 80 m`);
  const maples = inside.plants.filter(p => p.kind === FLORA_KIND.maple).length, susuki = inside.plants.filter(p => p.kind === FLORA_KIND.susuki).length;
  assert.ok(maples > 40 && susuki > 15, `${maples} maples and ${susuki} susuki clumps in 80 m of autumn wood`);
  for (const p of inside.plants) assert.ok(Math.abs(p.y - (nearest(p.x, p.z).y - .2)) < .01, 'every tree and clump stands on the ground under it');
  const whole = inside.triangles + inside.plants.length;
  const halves = [build(littered, start + 400, start + 440), build(littered, start + 440, start + 480)];
  assert.equal(halves.reduce((sum, h) => sum + h.triangles + h.plants.length, 0), whole, 'chunk seams change nothing');
  // Where the hillside falls away, a stone parapet runs along the verge and the wood thins, so the valley stays in view;
  // the planting that remains stands on the slope below the road.
  const valley = build(layout(autumn, 4), start + 400, start + 480);
  assert.ok(valley.stone >= 80 * 2 * 4, `${valley.stone} triangles of parapet in 80 m of valley side`);
  const valleyMaples = valley.plants.filter(p => p.kind === FLORA_KIND.maple).length;
  assert.ok(valleyMaples < maples / 2, `the valley side keeps ${valleyMaples} of ${maples} maples`);
  for (const p of valley.plants) assert.ok(Math.abs(p.y - (nearest(p.x, p.z).y - 4)) < .01, 'and they stand on the slope below');
  // Sugi only inside their own ranges.
  const wooded = layout({ ...autumn, cedars: [[start, start + 300]] });
  assert.ok(build(wooded, start + 100, start + 180).plants.some(p => p.kind === FLORA_KIND.cedar), 'cedars stand in their range');
  assert.ok(!build(wooded, start + 400, start + 480).plants.some(p => p.kind === FLORA_KIND.cedar), 'and nowhere else');

  // The afternoon routes pile thicker kerb drifts up to their dusk (`until`), from their own stream: the wood and the other
  // leaves stand where they did.
  const afternoon = layout({ ...autumn, afternoonLeaves: { gold: .2, drifts: 12, until: start + 300 } });
  const sunny = build(afternoon, start + 100, start + 180), plain80 = build(littered, start + 100, start + 180);
  assert.ok(sunny.triangles - plain80.triangles >= 80 * 2 * 12 * 2, `${sunny.triangles - plain80.triangles} more leaf triangles in 80 m of afternoon`);
  assert.deepEqual(sunny.plants, plain80.plants, 'the wood is unchanged');
  assert.equal(build(afternoon, start + 400, start + 480).triangles, inside.triangles, 'past its dusk the litter is as before');

  // A forest bank's verge (a city route's forests, `forestBanks`) keeps to its understory: the race's own forest stands
  // on the bank, so no modelled trees, but its shrubs, susuki and grass grow.
  const banked = build(layout({ ...autumn, forestBanks: true }), start + 400, start + 480);
  assert.ok(!banked.plants.some(p => p.kind === FLORA_KIND.maple || p.kind === FLORA_KIND.cedar), 'no modelled trees on a bank verge');
  assert.ok(banked.plants.some(p => p.kind === FLORA_KIND.susuki) && banked.plants.some(p => p.kind === FLORA_KIND.grass), 'but its susuki and grass');
});

test('a city route paves a forest bank\u2019s verge up to the bank, and only there; lots keep off it', () => {
  for (const id of ['aizu-wakamatsu-1986', 'kyoto-1986', 'nara-1986']) {
    const { track } = routes.find(route => route.id === id)!, scene = streetScene(id)!;
    const poses = track.samples.map(s => ({ p: s.progressMm / 1000, x: -s.eastMm / 1000, z: s.northMm / 1000, y: s.elevationMm / 1000,
      heading: -s.headingMicroturn * Math.PI * 2 / 1e6, width: s.halfWidthMm / 1000 }));
    const course = { length: track.lengthMm / 1000, circuit: false, poses };
    // The sector at each metre, so the district lookups stay cheap.
    const sectors: number[] = [];
    for (const s of track.samples) for (let m = sectors.length; m <= s.progressMm / 1000; m++) sectors.push(s.sector);
    const districtAt = (p: number, side: -1 | 1) => { const row = scene.districts[sectors[Math.max(0, Math.min(sectors.length - 1, Math.floor(p)))]!]!; return side < 0 ? row.right : row.left; };
    const open = periodCityOpenRuns(course, districtAt), forest = open.find(run => run.district === 'forest' && run.end - run.start > 200);
    if (!forest) continue;
    // The bank routes say so, the hillside route does not: its slope covers the verge.
    assert.equal(!!scene.street?.forestBanks, scene.terrain !== 'slope', `${id}: forestBanks matches its terrain`);
    const cut = periodCityGroundCut(course, open, [], scene.street?.forestBanks);
    const mid = poses.reduce((best, pose) => Math.abs(pose.p - (forest.start + forest.end) / 2) < Math.abs(best.p - (forest.start + forest.end) / 2) ? pose : best);
    const at = (beyond: number) => { const lateral = forest.side * (mid.width + beyond); return [mid.x + Math.cos(mid.heading) * lateral, mid.z - Math.sin(mid.heading) * lateral] as const; };
    assert.equal(cut(...at(10)), !scene.street?.forestBanks, `${id}: the verge 10 m out is ${scene.street?.forestBanks ? 'paved' : 'cut for the hillside'}`);
    assert.equal(cut(...at(30)), true, `${id}: the bank or hillside beyond is cut`);
    // The lots stand exactly where they stood when the whole verge was cut: none takes the paved forest verge.
    const before = periodCityGroundCut(course, open, []), lots = (ground: (x: number, z: number) => boolean) =>
      createPeriodCityLayout(course, { groundHeightAt: (x, z) => ground(x, z) ? null : 0, districtAt, open, street: scene.street }).lots.map(lot => lot.id).join();
    assert.equal(lots(cut), lots(before), `${id}: the lots stand where they did`);
  }
});

test('forest vegetation can use a hillside without filling park lawns, reserved landmarks or changing lots', () => {
  const course = { length: 240, circuit: false,
    poses: Array.from({ length: 49 }, (_, i) => ({ p: i * 5, x: 0, z: i * 5, y: 0, heading: 0, width: 5 })) };
  const districtAt = (p: number, side: PeriodSide): PeriodDistrict => p < 80 ? 'town' : side < 0 ? 'park' : 'forest';
  const groundHeightAt = (x: number, z: number) => z < 80 || Math.abs(x) < 6.7 ? 0 : null;
  const slope = {
    heightAt: (x: number) => x > 40 ? NaN : -.2,
    clearOfOtherLegs: (_x: number, _z: number, p: number, margin: number) => {
      assert.equal(margin, 3); return p < 200;
    },
  };
  const vegetationGroundHeightAt = periodCityForestVegetationGround(course, districtAt, groundHeightAt, slope);
  assert.equal(vegetationGroundHeightAt(12, 120), -.2, 'the forest hillside supplies its own height');
  assert.equal(vegetationGroundHeightAt(-12, 120), null, 'the park on the opposite side stays open');
  assert.equal(vegetationGroundHeightAt(12, 40), 0, 'existing town ground stays unchanged');
  assert.equal(vegetationGroundHeightAt(0, 120), 0, 'road ground stays unchanged');
  assert.equal(vegetationGroundHeightAt(45, 120), null, 'a missing hillside sample plants nothing');
  assert.equal(vegetationGroundHeightAt(12, 220), null, 'the other-leg clearance guard is respected');
  assert.equal(vegetationGroundHeightAt(70, 120), null, 'the finite forest strip has a bounded reach');
  const options = { districtAt, groundHeightAt,
    landmarks: [{ p: 140, side: 1 as const, kind: 'kasuga-torii' as const, clearance: 10, length: 12, depth: 14 }],
    street: { footbridges: [], guides: [], litter: [[80, 240] as const], autumn: true } };
  const before = createPeriodCityLayout(course, options), after = createPeriodCityLayout(course, { ...options, vegetationGroundHeightAt });
  assert.ok(before.lots.length > 0, 'the comparison includes actual town lots');
  assert.deepEqual(after.lots, before.lots, 'vegetation cannot admit or move any lot');
  assert.equal(after.groundHeightAt(12, 120), null, 'structures still use the clipped urban ground');
  const build = (layout: typeof after) => { const b = new CityMeshBuilder(0, 0); buildStreet(b, layout, 90, 240); return b; };
  assert.equal(build(before).flora.length, 0, 'the clipped sampler previously omitted the woodland');
  const b = build(after), kinds: number[] = [], footprint = landmarkFootprint(course, options.landmarks[0]!);
  for (let i = 0; i < b.flora.length; i += FLORA_STRIDE) {
    const [kind, x, y, z] = b.flora.slice(i, i + 4) as [number, number, number, number]; kinds.push(kind);
    assert.ok(x > 6.7 && z < 200, 'plants stay in forest beyond the shoulder, clear of the other leg');
    assert.equal(y, -.2, 'every plant stands on the hillside');
    const dx = x - footprint.x, dz = z - footprint.z;
    const u = Math.cos(footprint.yaw) * dx - Math.sin(footprint.yaw) * dz;
    const v = Math.sin(footprint.yaw) * dx + Math.cos(footprint.yaw) * dz;
    assert.ok(Math.abs(u) > footprint.halfX || Math.abs(v) > footprint.halfZ, 'the landmark footprint stays clear');
  }
  assert.ok(kinds.includes(FLORA_KIND.grass) && kinds.includes(FLORA_KIND.susuki), 'the understory now grows on its ground');
  assert.ok(!kinds.includes(FLORA_KIND.maple) && !kinds.includes(FLORA_KIND.cedar),
    'no extra tree rows close the valley views; the race already supplies its hillside forest');
});

test('the modelled plants batch into bark and foliage, each kind finite, within its triangle budget, tinted per plant', () => {
  const budgets = { [FLORA_KIND.maple]: 1400, [FLORA_KIND.cedar]: 900, [FLORA_KIND.susuki]: 40, [FLORA_KIND.willow]: 800, [FLORA_KIND.pine]: 900,
    [FLORA_KIND.grass]: 8 } as const;
  for (const [kind, budget] of Object.entries(budgets)) {
    const data: number[] = [];
    for (let i = 0; i < 6; i++) data.push(Number(kind), i * 7, 0, 3, i, 1, .5, .2, .1, i * 13);
    const meshes = floraMeshes(data), leaves = meshes.find(m => m.name.includes('leaves'))!;
    assert.ok(leaves, `kind ${kind} draws foliage`);
    let triangles = 0;
    for (const mesh of meshes) {
      assert.ok(Number.isFinite(mesh.boundingSphere!.radius) && mesh.boundingSphere!.radius > 0, `kind ${kind}: a finite bound`);
      triangles += mesh.geometry.index!.count / 3;
    }
    // The batch holds each variant once; 6 plants of a kind use at most all of its variants.
    assert.ok(triangles / 6 < budget * 1.01 || triangles < budget * 5, `kind ${kind}: ${triangles} triangles for its variants`);
    assert.equal(leaves.instanceCount, 6, `kind ${kind}: one foliage instance per plant`);
    for (const mesh of meshes) mesh.dispose();
  }
});

test('every route keeps its landmarks off its roads, every leg of them, and clear of every lot', () => {
  const corners = (f: PeriodFootprint) => [-1, 1].flatMap(x => [-1, 1].map(z => ({
    x: f.x + Math.cos(f.yaw) * f.halfX * x + Math.sin(f.yaw) * f.halfZ * z, z: f.z - Math.sin(f.yaw) * f.halfX * x + Math.cos(f.yaw) * f.halfZ * z })));
  // Independent edge projections, rather than the planner's own SAT helper.
  const separated = (a: PeriodFootprint, b: PeriodFootprint) => {
    const ca = corners(a), cb = corners(b);
    return [ca, cb].some(points => [1, 2].some(i => {
      const ex = points[i]!.x - points[0]!.x, ez = points[i]!.z - points[0]!.z, along = (q: { x: number; z: number }) => q.z * ex - q.x * ez;
      const pa = ca.map(along), pb = cb.map(along);
      return Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6;
    }));
  };
  for (const { id, track } of routes) {
    const scene = streetScene(id);
    if (!scene?.landmarks.length) continue;
    const poses = track.samples.map(s => ({ p: s.progressMm / 1000, x: -s.eastMm / 1000, z: s.northMm / 1000, y: s.elevationMm / 1000,
      heading: -s.headingMicroturn * Math.PI * 2 / 1e6, width: s.halfWidthMm / 1000 }));
    const sectorAt = (p: number) => { let sector = track.samples[0]!.sector; for (const s of track.samples) { if (s.progressMm / 1000 > p) break; sector = s.sector; } return sector; };
    const course = { length: track.lengthMm / 1000, circuit: track.topology === 'circuit', poses };
    const layout = createPeriodCityLayout(course, { groundHeightAt: () => 0, crossings: scene.crossings, landmarks: scene.landmarks,
      districtAt: (p, side) => { const row = scene.districts[sectorAt(p)]!; return side < 0 ? row.right : row.left; } });
    for (const l of layout.landmarks) {
      const f = landmarkFootprint(course, l);
      assert.ok(layout.lots.every(lot => separated(lot.footprint, f)), `${id}: a lot stands on the ${l.kind} at ${l.p} m`);
      // No road centre comes within its half-width of the footprint, on this leg or any other.
      for (const pose of poses) {
        const dx = pose.x - f.x, dz = pose.z - f.z;
        const x = Math.cos(f.yaw) * dx - Math.sin(f.yaw) * dz, z = Math.sin(f.yaw) * dx + Math.cos(f.yaw) * dz;
        assert.ok(Math.abs(x) >= f.halfX + pose.width || Math.abs(z) >= f.halfZ + pose.width, `${id}: the ${l.kind} at ${l.p} m covers the road at ${pose.p.toFixed(0)} m`);
      }
    }
  }
});
