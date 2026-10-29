import { TECH_NODES, techNode, tuneFor } from './garage-tech';
import type { Bilingual } from './story';
import { STOCK_TUNE, type CarTune } from './tuned-engine';

// What a garage part does, in a driver's terms: the five car stats the garage
// draws as bars, the arrow chips on each part's card, before-and-after readings
// in km/h, seconds and percent, and the race time each part was measured to save.
// Presentation only: races always use the exact tune.

export const LOWER_IS_BETTER: ReadonlySet<keyof CarTune> = new Set<keyof CarTune>(['boostCost', 'wetDamping', 'cornerLoad', 'windLoad', 'offroadLoss', 'treeLoss', 'signLoss', 'contactLoss']);
/** The best value each tuning field reaches in any finished build. */
const BEST = (() => {
  const forks = new Map<string, string[]>();
  for (const node of TECH_NODES) if (node.fork) forks.set(node.fork, [...forks.get(node.fork) ?? [], node.id]);
  const builds = [...forks.values()].reduce((all, options) => all.flatMap(build => options.map(option => [...build, option])), [TECH_NODES.filter(node => !node.fork).map(node => node.id)]);
  const best: Partial<Record<keyof CarTune, number>> = {};
  for (const tune of builds.map(tuneFor)) for (const field of Object.keys(tune) as (keyof CarTune)[]) {
    const current = best[field];
    if (current === undefined || (LOWER_IS_BETTER.has(field) ? tune[field] < current : tune[field] > current)) best[field] = tune[field];
  }
  return best;
})();
/** Progress from stock (0) towards the best finished build (1); negative for a trade-off. */
export function statProgress(tune: CarTune, field: keyof CarTune): number {
  const top = BEST[field] ?? STOCK_TUNE[field];
  return top === STOCK_TUNE[field] ? 0 : (tune[field] - STOCK_TUNE[field]) / (top - STOCK_TUNE[field]);
}
const average = (tune: CarTune, fields: (keyof CarTune)[]) => fields.reduce((sum, field) => sum + statProgress(tune, field), 0) / fields.length;
const kmh = (mmPerTick: number) => Math.round(mmPerTick * 0.108);

export type StatId = 'speed' | 'accel' | 'boost' | 'grip' | 'tough';
export interface CarStat {
  readonly id: StatId; readonly label: Bilingual;
  /** The label on effect chips, where space is short. */
  readonly short: Bilingual;
  readonly value: (tune: CarTune) => number; readonly reading: (tune: CarTune) => string;
}
/** The garage's five summary stats, 0 at stock and 1 at a finished build. */
export const CAR_STATS: readonly CarStat[] = [
  { id: 'speed', label: { ja: '最高速', en: 'TOP SPEED' }, short: { ja: '最高速', en: 'TOP SPEED' }, value: t => statProgress(t, 'topSpeed'), reading: t => `${kmh(t.topSpeed)} km/h` },
  { id: 'accel', label: { ja: '加速', en: 'ACCELERATION' }, short: { ja: '加速', en: 'ACCEL' }, value: t => 0.7 * statProgress(t, 'accel') + 0.3 * statProgress(t, 'traction'), reading: t => `${Math.round(t.accel / STOCK_TUNE.accel * 100)}%` },
  { id: 'boost', label: { ja: 'ブースト', en: 'BOOST' }, short: { ja: 'ブースト', en: 'BOOST' }, value: t => average(t, ['boostSpeed', 'boostCost', 'boostRecharge', 'boostKick']), reading: t => `${kmh(t.boostSpeed)} km/h · ${(1000 / t.boostCost / 30).toFixed(1)} s` },
  { id: 'grip', label: { ja: '安定', en: 'STABILITY' }, short: { ja: '安定', en: 'STABILITY' }, value: t => average(t, ['cornerLoad', 'windLoad', 'rainSteer', 'oilSteer', 'steer']), reading: () => '' },
  { id: 'tough', label: { ja: '耐久', en: 'TOUGHNESS' }, short: { ja: '耐久', en: 'TOUGHNESS' }, value: t => average(t, ['contactLoss', 'offroadLoss', 'treeLoss', 'signLoss']), reading: () => '' },
];

export type SpecialId = 'drift' | 'draft' | 'antilag';
/** Garage-only mechanics, named on the cards of the parts that add them. */
const SPECIALS: readonly { readonly id: SpecialId; readonly field: keyof CarTune; readonly label: Bilingual }[] = [
  { id: 'drift', field: 'driftCharge', label: { ja: 'ドリフト充電', en: 'DRIFT CHARGE' } },
  { id: 'draft', field: 'draft', label: { ja: 'スリップストリーム', en: 'SLIPSTREAM' } },
  { id: 'antilag', field: 'boostKick', label: { ja: 'アンチラグ', en: 'ANTI-LAG' } },
];
export interface EffectChip {
  readonly id: StatId | SpecialId; readonly label: Bilingual;
  /** −3 to 3 arrows for a stat; 0 for a special mechanic the part adds. */
  readonly level: number;
}
/** Arrows for a change on the stat bars' scale, where 1 is stock to a finished build. */
export const chipLevel = (change: number): number => {
  const size = Math.abs(change);
  return Math.sign(change) * (size >= 0.3 ? 3 : size >= 0.17 ? 2 : size >= 0.04 ? 1 : 0);
};
/** A part at a glance: the stats it raises (largest first), the mechanics it adds, then what it costs. */
export function partChips(id: string): EffectChip[] {
  const node = techNode(id);
  if (!node) throw new RangeError(`Unknown garage part: ${id}`);
  const tune = tuneFor([id]), stats = CAR_STATS.map(stat => ({ id: stat.id, label: stat.short, level: chipLevel(stat.value(tune) - stat.value(STOCK_TUNE)) }));
  return [
    ...stats.filter(chip => chip.level > 0).sort((a, b) => b.level - a.level),
    ...SPECIALS.filter(special => (node.effects[special.field] ?? 0) > 0).map(({ id, label }) => ({ id, label, level: 0 })),
    ...stats.filter(chip => chip.level < 0).sort((a, b) => a.level - b.level),
  ];
}

interface Reading { readonly label: Bilingual; readonly hint: Bilingual; readonly show: (tune: CarTune) => string }
const S = STOCK_TUNE;
const percent = (value: number, stock: number) => `${Math.round(value / stock * 100)}%`;
const extra = (value: number) => value ? `+${Math.round(value / S.accel * 100)}%` : '—';
const seconds = (value: number) => `${value.toFixed(1)} s`;
/** Every field a part can change, in race units and in the order the detail panel lists them. */
const READINGS: Readonly<Partial<Record<keyof CarTune, Reading>>> = {
  topSpeed: { label: { ja: '最高速', en: 'Top speed' }, hint: { ja: '直線で出る速さ', en: 'On the straights' }, show: t => `${kmh(t.topSpeed)} km/h` },
  accel: { label: { ja: '加速', en: 'Acceleration' }, hint: { ja: '速度の乗り（ノーマル＝100%）', en: 'Picking up speed (stock = 100%)' }, show: t => percent(t.accel, S.accel) },
  traction: { label: { ja: '低速での加速', en: 'Low-speed pull' }, hint: { ja: '160km/hまで：発進・立ち上がり・立て直し', en: 'Up to 160 km/h: launches, exits, recoveries' }, show: t => extra(t.traction) },
  boostSpeed: { label: { ja: 'ブースト中の最高速', en: 'Boost top speed' }, hint: { ja: 'ターボで伸びる速さ', en: 'How fast the boost takes you' }, show: t => `${kmh(t.boostSpeed)} km/h` },
  boostCost: { label: { ja: 'ブーストの持続', en: 'Boost lasts' }, hint: { ja: '満タンから押し続けて', en: 'A full tank, held down' }, show: t => seconds(1000 / t.boostCost / 30) },
  boostRecharge: { label: { ja: 'ブーストの回復', en: 'Boost refill' }, hint: { ja: '空から満タンまで', en: 'Empty to full' }, show: t => seconds(1000 / t.boostRecharge / 30) },
  boostKick: { label: { ja: 'ブースト中の加速', en: 'Boost acceleration' }, hint: { ja: '押した瞬間から速く伸びる', en: 'Reaches boost speed sooner' }, show: t => extra(t.boostKick) },
  draft: { label: { ja: 'スリップストリーム', en: 'Slipstream' }, hint: { ja: '前の車の4〜22m後ろで最高速が上がる', en: 'Extra top speed 4–22 m behind a car' }, show: t => t.draft ? `+${kmh(t.draft)} km/h` : '—' },
  driftCharge: { label: { ja: 'ドリフト充電', en: 'Drift charge' }, hint: { ja: 'コーナーへドリフトで入ると毎秒ターボが溜まる', en: 'Turbo refilled each second drifting into a tight corner' }, show: t => t.driftCharge ? `+${t.driftCharge * 3}%` : '—' },
  steer: { label: { ja: 'ハンドル', en: 'Steering' }, hint: { ja: '切ったときの曲がり', en: 'How sharply it turns in' }, show: t => percent(t.steer, S.steer) },
  driftSteer: { label: { ja: 'ドリフト中の曲がり', en: 'Drift steering' }, hint: { ja: 'ドリフト中に向きを変える力', en: 'Turning while drifting' }, show: t => percent(t.driftSteer, S.driftSteer) },
  cornerLoad: { label: { ja: 'コーナーで膨らむ力', en: 'Corner push' }, hint: { ja: '低いほど外へ流されない', en: 'Lower: less pushed wide' }, show: t => percent(t.cornerLoad, S.cornerLoad) },
  windLoad: { label: { ja: '横風で流される力', en: 'Crosswind push' }, hint: { ja: '低いほど風に強い', en: 'Lower: steadier in wind' }, show: t => percent(t.windLoad, S.windLoad) },
  rainSteer: { label: { ja: '雨のハンドル', en: 'Wet steering' }, hint: { ja: '雨の路面での曲がり', en: 'Turning on a wet road' }, show: t => percent(t.rainSteer, S.rainSteer) },
  wetDamping: { label: { ja: '雨の横滑り', en: 'Rain slides' }, hint: { ja: '滑りが半分に収まるまで', en: 'Time for a slide to halve' }, show: t => `${(Math.log(0.5) / Math.log(t.wetDamping / 16) / 30).toFixed(2)} s` },
  oilSteer: { label: { ja: '油膜のハンドル', en: 'Oil steering' }, hint: { ja: '油膜の上での曲がり', en: 'Turning on an oil slick' }, show: t => percent(t.oilSteer, S.oilSteer) },
  offroadLoss: { label: { ja: 'コース外の失速', en: 'Off-road drag' }, hint: { ja: '低いほど道を外れても遅くならない', en: 'Lower: keeps speed off the road' }, show: t => percent(t.offroadLoss, S.offroadLoss) },
  treeLoss: { label: { ja: '木に当たると', en: 'Hitting a tree' }, hint: { ja: '1回で失う速度', en: 'Speed lost per hit' }, show: t => `−${kmh(t.treeLoss)} km/h` },
  signLoss: { label: { ja: '看板に当たると', en: 'Hitting a sign' }, hint: { ja: '1回で失う速度', en: 'Speed lost per hit' }, show: t => `−${kmh(t.signLoss)} km/h` },
  contactLoss: { label: { ja: '車と当たると', en: 'Bumping a car' }, hint: { ja: '1回で失う速度', en: 'Speed lost per bump' }, show: t => `−${kmh(t.contactLoss)} km/h` },
};
export const READING_FIELDS = Object.keys(READINGS) as (keyof CarTune)[];
export interface EffectLine {
  readonly field: keyof CarTune; readonly label: Bilingual; readonly hint: Bilingual;
  readonly before: string; readonly after: string; readonly better: boolean;
}
/** What changes between two cars, field by field, in race units: improvements first, then trade-offs. */
export function effectLines(before: CarTune, after: CarTune): EffectLine[] {
  const lines = READING_FIELDS.filter(field => before[field] !== after[field]).map((field): EffectLine => {
    const { label, hint, show } = READINGS[field]!;
    return { field, label, hint, before: show(before), after: show(after), better: LOWER_IS_BETTER.has(field) ? after[field] < before[field] : after[field] > before[field] };
  });
  return [...lines.filter(line => line.better), ...lines.filter(line => !line.better)];
}

/** Seconds a race each part saves on Hakone, Yokohama and Nikko (track order) for the drivers
 * its `bestFor` tag names, measured along its unlock path. tests/garage-balance.test.ts
 * re-measures them and `npm run balance:garage` prints fresh values after a rebalance.
 */
export const RACE_GAINS: Readonly<Record<string, readonly [number, number, number]>> = {
  'engine-intake': [0.9, 1.1, 0.9], 'engine-cams': [0.7, 1.1, 0.7], 'engine-highrev': [1.2, 1.4, 1.1], 'engine-torque': [1.4, 2.0, 1.0], 'engine-fulltune': [0.7, 0.9, 0.7],
  'turbo-controller': [0.5, 0.6, 0.4], 'turbo-intercooler': [0.7, 0.9, 0.6], 'turbo-big': [1.2, 1.4, 1.0], 'turbo-twin': [1.1, 1.2, 1.0], 'turbo-antilag': [1.2, 1.2, 1.0],
  'chassis-tyres': [0.3, 0.7, 0.3], 'chassis-coilovers': [0.3, 1.1, 0.0], 'chassis-touge': [1.2, 1.3, 0.8], 'chassis-rally': [0.2, 0.9, 0.2], 'chassis-lsd': [0.9, 0.8, 0.9],
  'body-cage': [0.3, 0.3, 0.4], 'body-bumpers': [0.1, 0.2, 0.2], 'body-light': [0.6, 0.7, 0.5], 'body-armor': [0.6, 1.3, 0.2], 'body-windtunnel': [0.7, 0.9, 0.6],
};
