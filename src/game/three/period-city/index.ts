import * as THREE from 'three';
import type { SignPools } from './signs';
import { CityMeshBuilder, type CityMaterialKey } from './geometry';
import { buildLot, type CityFixture } from './buildings';
import { farLights } from './far-lights';
import { cityWires } from './wires';
import { createPeriodCityLayout, periodCityChunksNear, periodCityOpenAt, periodCityPlantingClear,
  type PeriodCityCourse, type PeriodCityLayout, type PeriodCityOptions, type PeriodOpenRun, type PeriodSide } from './layout';
import { cityNight, periodCityMaterials, setPeriodCityTime } from './materials';
import { PeriodPeople } from './people';
import { buildOpenGround } from './open-ground';
import { PeriodSky } from './sky';
import { PeriodSkyline, type PeriodDistant } from './skyline';
import { buildStreet } from './street';
import { setAutumnFoliage } from '../autumn-foliage';
import { floraMeshes } from './flora';

export { setPeriodCityLampHeads, setPeriodCityLighting } from './materials';
export { MovingFarLights } from './far-lights';
export { ARCADE_1986_CROSSINGS, ARCADE_1986_LANDMARKS, ARCADE_1986_STREET, MOAT, TOKYO_1986_CROSSINGS, TOKYO_1986_DISTRICTS, TOKYO_1986_LANDMARKS,
  TOKYO_1986_STREET, arcadeDistrictAt,
  moatWidth, periodCityGroundCut, periodCityOpenRuns, periodCityRouteFrame, type PeriodDistrict, type PeriodOpenRun, type PeriodSide } from './layout';
export { QUAY } from './open-ground';
export { ARCADE_DISTANT } from './skyline';
export type { CityFixture } from './buildings';

interface Chunk { readonly group: THREE.Group; readonly fixtures: readonly CityFixture[]; readonly triangles: number; used: number }
/** Chunks kept (hidden) after leaving the window, so a short reverse or a lap seam rebuilds nothing. */
const RETAINED_CHUNKS = 14;
const SHADOWLESS: ReadonlySet<CityMaterialKey> = new Set(['glass', 'lamp', 'sign', 'water', 'neon', 'flag']);

/**
 * The 1986 city along a street course (docs/period-city.md). The layout is
 * computed once per course; geometry is built per 80 m chunk around the
 * player, one merged mesh per material, nearest chunk first.
 */
export class PeriodCity {
  readonly group = new THREE.Group();
  private readonly materials: Record<CityMaterialKey, THREE.Material>;
  private layout: PeriodCityLayout | null = null;
  private readonly chunks = new Map<number, Chunk>();
  private readonly people: PeriodPeople;
  private skyline: PeriodSkyline | null = null;
  private sky: PeriodSky | null = null;
  private progress = 0;
  private time = 0;
  private snow = 0;
  private signs: SignPools | null = null;
  private frame = 0;

  /**
   * `emblemUrl`: the exact SORA emblem image for the city's billboards; `spritesUrl`: the street-people sprite atlas;
   * `interiorsUrl`: the rooms seen through lit windows.
   */
  constructor(private readonly emblemUrl: string, spritesUrl?: string, interiorsUrl?: string) {
    this.group.name = 'SORA period city (Tokyo 1986)';
    this.materials = periodCityMaterials(emblemUrl, interiorsUrl);
    this.people = new PeriodPeople(spritesUrl);
  }

  get active(): boolean { return this.layout !== null; }
  /** The moat water, so the race can give it the road's specular ceilings. */
  get water(): THREE.MeshStandardMaterial { return this.materials.water as THREE.MeshStandardMaterial; }

  /** `origin` (the course's real latitude and longitude) adds the distant 1986 skyline; `distant` adds far mountains. */
  setCourse(course: PeriodCityCourse, options: PeriodCityOptions & { readonly origin?: { readonly lat: number; readonly lon: number };
    readonly distant?: readonly PeriodDistant[]; readonly snow?: number; readonly signs?: SignPools | null }): void {
    this.clear();
    this.layout = createPeriodCityLayout(course, options);
    setAutumnFoliage(this.layout.street.autumn ? 1 : 0);
    this.snow = options.snow ?? 0; this.signs = options.signs ?? null;
    this.group.add(this.people.mesh, this.people.shadows);
    this.sky = new PeriodSky(this.layout, this.emblemUrl); this.group.add(this.sky.group);
    if (options.origin || options.distant?.length) {
      this.skyline = new PeriodSkyline(options.origin ?? null, options.distant); this.group.add(this.skyline.group);
    }
    this.group.userData.periodCityStats = { lots: this.layout.lots.length, ...this.layout.stats };
  }

  clear(): void {
    setAutumnFoliage(0);
    this.skyline?.dispose(); this.skyline = null;
    this.sky?.dispose(); this.sky = null;
    for (const chunk of this.chunks.values()) this.dispose(chunk);
    this.chunks.clear(); this.layout = null; this.people.clear(); this.group.clear();
  }

  /**
   * Walk the crowds near `progress` and run the neon, chasing bulbs, banners and the sky at render time `time` (seconds);
   * `wetness` (0-1, the road's) opens umbrellas.
   */
  animate(progress: number, time: number, wetness = 0): void {
    this.progress = progress; this.time = time;
    setPeriodCityTime(time);
    this.people.update(this.layout, progress, time, wetness);
  }

  /**
   * Stream the window around `progress`: build missing chunks nearest first,
   * at most `budget` per call unless `immediate` (a course start or seek).
   */
  update(progress: number, immediate = false, budget = 1): void {
    const layout = this.layout; if (!layout) return;
    this.frame++;
    const { course } = layout;
    const distance = (key: number) => {
      let delta = (key + .5) * layout.chunkLength - progress;
      if (course.circuit) delta = ((delta + course.length / 2) % course.length + course.length) % course.length - course.length / 2;
      return delta < 0 ? -delta * 2 : delta;
    };
    const wanted = periodCityChunksNear(layout, progress).sort((a, b) => distance(a) - distance(b));
    let built = 0;
    for (const key of wanted) {
      let chunk = this.chunks.get(key);
      if (!chunk) {
        if (!immediate && built >= budget) continue;
        chunk = this.build(key, layout); this.chunks.set(key, chunk); built++;
      }
      chunk.used = this.frame; chunk.group.visible = true;
    }
    const stale = [...this.chunks].filter(([key]) => !wanted.includes(key)).sort((a, b) => a[1].used - b[1].used);
    for (const [, chunk] of stale) chunk.group.visible = false;
    while (stale.length && this.chunks.size > wanted.length + RETAINED_CHUNKS) {
      const [key, chunk] = stale.shift()!; this.dispose(chunk); this.chunks.delete(key);
    }
    let triangles = 0, visible = 0;
    for (const chunk of this.chunks.values()) if (chunk.group.visible) { triangles += chunk.triangles; visible++; }
    this.group.userData.periodCityFrame = { visibleChunks: visible, builtThisFrame: built, triangles };
  }

  /** Keep the distant landmarks in their true directions around the camera; fly the airship, balloons and searchlights. */
  placeSkyline(camera: THREE.Vector3, daylight: number): void {
    this.skyline?.update(camera, daylight);
    this.sky?.update(camera, this.progress, this.time, cityNight.value);
  }

  /** Shop lights of the visible chunks, nearest first. */
  nearestFixtures(position: THREE.Vector3, count: number, out: CityFixture[] = []): CityFixture[] {
    out.length = 0;
    for (const chunk of this.chunks.values()) if (chunk.group.visible) for (const fixture of chunk.fixtures)
      if (fixture.position.distanceToSquared(position) < 70 ** 2) out.push(fixture);
    out.sort((a, b) => a.position.distanceToSquared(position) - b.position.distanceToSquared(position));
    out.length = Math.min(out.length, count);
    return out;
  }

  plantingClear(x: number, z: number, radius: number): boolean {
    return !this.layout || periodCityPlantingClear(this.layout, x, z, radius);
  }

  /** The moat, park or shrine precinct at a progress and side, if any. */
  openAt(p: number, side: PeriodSide): PeriodOpenRun | null {
    return this.layout ? periodCityOpenAt(this.layout, p, side) : null;
  }

  private build(key: number, layout: PeriodCityLayout): Chunk {
    const lots = layout.chunks.get(key) ?? [];
    const origin = lots[0] ?? { x: 0, z: 0 };
    const builder = new CityMeshBuilder(origin.x, origin.z), fixtures: CityFixture[] = [];
    builder.snow = this.snow; builder.signs = this.signs;
    for (const lot of lots) buildLot(builder, lot, fixtures);
    buildOpenGround(builder, layout, key * layout.chunkLength, (key + 1) * layout.chunkLength, this.snow);
    buildStreet(builder, layout, key * layout.chunkLength, (key + 1) * layout.chunkLength);
    const group = new THREE.Group();
    group.name = `Period city chunk ${key}`; group.position.set(origin.x, 0, origin.z);
    for (const [material, geometry] of builder.finish()) {
      const mesh = new THREE.Mesh(geometry, this.materials[material]);
      mesh.name = `Period city ${key} ${material}`;
      mesh.castShadow = !SHADOWLESS.has(material); mesh.receiveShadow = material !== 'lamp';
      group.add(mesh);
    }
    // The far street's lamps, lanterns and box signs as glowing points (far-lights.ts).
    const lights = farLights(builder.beacons);
    if (lights) group.add(lights);
    // The overhead wires as screen-space lines (wires.ts).
    const wires = cityWires(builder.wires);
    if (wires) group.add(wires);
    // The modelled maples, cedars and grass of the autumn routes (flora.ts).
    for (const mesh of floraMeshes(builder.flora)) group.add(mesh);
    group.updateMatrixWorld(true);
    this.group.add(group);
    return { group, fixtures, triangles: builder.triangles, used: this.frame };
  }

  private dispose(chunk: Chunk): void {
    chunk.group.traverse(object => {
      if (object instanceof THREE.BatchedMesh) object.dispose();
      else if (object instanceof THREE.Mesh || object instanceof THREE.Points) object.geometry.dispose();
    });
    this.group.remove(chunk.group);
  }
}
