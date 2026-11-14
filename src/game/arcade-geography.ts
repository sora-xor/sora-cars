import roads from './generated/arcade-roads.json';

/**
 * Where the Arcade courses are in the real world of 1986. Each course is three laps drawn end to end, and that whole
 * length follows one stretch of real road at true scale: Midnight Circuit climbs National Route 1 from Hakone-Yumoto
 * to Miyanoshita, Harbor Run runs from Sakuragichō station over Bankoku-bashi onto Shinkō Pier and along Yokohama's
 * waterfront to Honmoku's D pier, and Sakura Pass runs from the JNR Nikkō station up the main street to Shinkyō and on
 * up Route 120 to Kiyotaki.
 *
 * Local races (the driving model) take the real road's plan, its bends and hairpins, and its heights; both come from
 * the traced roads in world/research/arcade (scripts/build-arcade-geography.ts), and the 3D world draws the course
 * the race runs on, so a car takes the hairpin and climbs the hill it is drawn on. RaceV1 (rules.ts), whose bends
 * Iroha's native rules and proofs mirror, still has its own; the world draws those on the same heights and places.
 */
export interface ArcadeRoad {
  readonly track: number;
  /** The real road, for menus and notes. */
  readonly name: { readonly ja: string; readonly en: string };
  readonly from: { readonly ja: string; readonly en: string };
  readonly to: { readonly ja: string; readonly en: string };
  /** Metres above sea level at the start line and at the finish. */
  readonly startElevation: number;
  readonly finishElevation: number;
  /** The course every 250 m as progress, latitude and longitude on the real road, for bearings to far scenery. */
  readonly axis: readonly (readonly number[])[];
}

const NAMES: readonly Pick<ArcadeRoad, 'name' | 'from' | 'to'>[] = [
  { name: { ja: '国道1号', en: 'National Route 1' }, from: { ja: '箱根湯本', en: 'Hakone-Yumoto' }, to: { ja: '宮ノ下', en: 'Miyanoshita' } },
  { name: { ja: '本町通り・海岸通り・山下公園通り', en: 'Honchō-dōri and the Yokohama waterfront' }, from: { ja: '桜木町駅', en: 'Sakuragichō Station' }, to: { ja: '本牧埠頭', en: 'Honmoku Pier' } },
  { name: { ja: '国道119号・120号', en: 'National Routes 119 and 120' }, from: { ja: '国鉄日光駅', en: 'JNR Nikkō Station' }, to: { ja: '清滝', en: 'Kiyotaki' } },
];
const courses = roads.courses;

export const ARCADE_ROADS: readonly ArcadeRoad[] = NAMES.map((names, track) => {
  const course = courses.find(item => item.track === track)!;
  return Object.freeze({ track, ...names, startElevation: course.startElevationM, finishElevation: course.finishElevationM, axis: course.axis });
});

/** Road height (m) above the start line at a progress along the unrolled course: a Catmull–Rom curve through the
 * 20 m samples, so the grade is continuous. Level before the lead-in and beyond the run-off, and on unknown tracks. */
export function arcadeRoadHeight(track: number, progress: number): number {
  const heights = courses.find(item => item.track === track)?.heightsCm;
  if (!heights || !Number.isFinite(progress)) return 0;
  const x = Math.min(heights.length - 1, Math.max(0, (progress - roads.firstM) / roads.stepM));
  const i = Math.min(heights.length - 2, Math.floor(x)), t = x - i;
  const a = heights[Math.max(0, i - 1)]!, b = heights[i]!, c = heights[i + 1]!, d = heights[Math.min(heights.length - 1, i + 2)]!;
  return (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t) / 200;
}
/** An Arcade course's real plan: its heading every `step` metres from `first` (the lead-in, before the start line) to
 * the end of the run-off beyond the finish, in radians clockwise from its direction at the start line. */
export interface ArcadePlan {
  readonly track: number;
  readonly first: number;
  readonly step: number;
  readonly headings: Float64Array;
  /** The race's length (three laps) and the road drawn beyond its finish. */
  readonly length: number;
  readonly runoff: number;
}
const plans = new Map<number, ArcadePlan | null>();
/** The real plan of an Arcade course (null on an unknown track). */
export function arcadePlan(track: number): ArcadePlan | null {
  if (plans.has(track)) return plans.get(track)!;
  const course = courses.find(item => item.track === track);
  const plan = course ? Object.freeze({ track, first: roads.firstM, step: roads.planStepM, length: course.lengthM, runoff: course.runoffM,
    headings: Float64Array.from(course.headingsE5, value => value / 1e5) }) : null;
  plans.set(track, plan);
  return plan;
}

/** A real place (latitude, longitude) in an Arcade course's frame: metres ahead along the start line's heading and to
 * its left, from the start line, as the course on its real plan is drawn. The plan is smoothed, so a point far along
 * the course strays from the map by up to some tens of metres; far scenery kilometres off holds its bearing. */
export function arcadeFramePoint(track: number, lat: number, lon: number): { ahead: number; left: number } {
  const course = courses.find(item => item.track === track);
  if (!course) return { ahead: 0, left: 0 };
  const [lat0, lon0] = course.origin as [number, number], rad = Math.PI / 180, earth = 6371008.8;
  const east = (lon - lon0) * rad * Math.cos(lat0 * rad) * earth, north = (lat - lat0) * rad * earth, bearing = course.bearingDeg * rad;
  return { ahead: east * Math.sin(bearing) + north * Math.cos(bearing), left: -(east * Math.cos(bearing) - north * Math.sin(bearing)) };
}
