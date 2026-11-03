import { vehicleSpec } from './drive/vehicle';
import { TECH_NODES, techNode, tuneFor } from './garage-tech';
import type { Bilingual } from './story';
import { STOCK_TUNE, type CarTune } from './tuned-engine';

// What a garage part does, in a driver's terms: the five car stats the garage
// draws as bars, the arrow chips on each part's card, before-and-after readings
// of the car the driving model races, in km/h, seconds and percent, and the race
// time each part was measured to save. Presentation only: races always use the exact tune.

export const LOWER_IS_BETTER: ReadonlySet<keyof CarTune> = new Set<keyof CarTune>(['coast', 'boostCost', 'wetDamping', 'cornerLoad', 'windLoad', 'offroadLoss', 'treeLoss', 'signLoss', 'contactLoss']);
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
/** The driving model's car for a tune, against the stock car. */
const STOCK_SPEC = vehicleSpec(STOCK_TUNE);
const specs = new WeakMap<CarTune, ReturnType<typeof vehicleSpec>>();
const spec = (tune: CarTune) => { let value = specs.get(tune); if (!value) specs.set(tune, value = vehicleSpec(tune)); return value; };
const power = (tune: CarTune) => `${Math.round(spec(tune).power / STOCK_SPEC.power * 100)}%`;

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
  { id: 'accel', label: { ja: '加速', en: 'ACCELERATION' }, short: { ja: '加速', en: 'ACCEL' }, value: t => 0.7 * statProgress(t, 'accel') + 0.3 * statProgress(t, 'traction'), reading: power },
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
const share = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (value: number) => `${value.toFixed(1)} s`;
/** The stock car's push while boosting at its limiter, the scale for anti-lag's extra push. */
const BOOST_PUSH = (STOCK_SPEC.power + STOCK_SPEC.boostPower) / STOCK_SPEC.topSpeed;
const RAIN: Reading = { label: { ja: '雨のグリップ', en: 'Rain grip' }, hint: { ja: '乾いた路面に対して', en: 'Share of the dry road’s' }, show: t => share(spec(t).rainGrip) };
const DAMAGE: Reading = { label: { ja: '1回の衝撃のダメージ', en: 'Damage per hit' }, hint: { ja: '車・ガードレール・看板。低いほど大破しにくい', en: 'Cars, rails and signs. Lower: further from a wreck' }, show: t => share(spec(t).toughness) };
/** Every field a part can change, as the driving model reads it, in the order the detail panel lists them. */
const READINGS: Readonly<Partial<Record<keyof CarTune, Reading>>> = {
  topSpeed: { label: { ja: '最高速', en: 'Top speed' }, hint: { ja: '直線で出る速さ', en: 'On the straights' }, show: t => `${kmh(t.topSpeed)} km/h` },
  accel: { label: { ja: 'エンジン出力', en: 'Engine power' }, hint: { ja: '速度の乗り（ノーマル＝100%）', en: 'Picking up speed (stock = 100%)' }, show: power },
  traction: { label: { ja: '低速での加速', en: 'Low-speed pull' }, hint: { ja: '160km/hまで：発進・立ち上がり・立て直し', en: 'Up to 160 km/h: launches, exits, recoveries' }, show: t => t.traction ? `+${share(spec(t).launch)}` : '—' },
  coast: { label: { ja: 'エンジンブレーキ', en: 'Engine braking' }, hint: { ja: 'アクセルを戻したときの減速。低いほど速度を保つ', en: 'Off the throttle. Lower: keeps more speed when you lift' }, show: t => percent(t.coast, S.coast) },
  boostSpeed: { label: { ja: 'ブースト中の最高速', en: 'Boost top speed' }, hint: { ja: 'タービンが大きいほど強く押し出す', en: 'A bigger turbine also pushes harder' }, show: t => `${kmh(t.boostSpeed)} km/h` },
  boostCost: { label: { ja: 'ブーストの持続', en: 'Boost lasts' }, hint: { ja: '満タンから押し続けて', en: 'A full tank, held down' }, show: t => seconds(1000 / t.boostCost / 30) },
  boostRecharge: { label: { ja: 'ブーストの回復', en: 'Boost refill' }, hint: { ja: '空から満タンまで', en: 'Empty to full' }, show: t => seconds(1000 / t.boostRecharge / 30) },
  boostKick: { label: { ja: 'ブースト中の加速', en: 'Boost acceleration' }, hint: { ja: '押した瞬間から速く伸びる', en: 'Reaches boost speed sooner' }, show: t => t.boostKick ? `+${share(spec(t).boostKick / BOOST_PUSH)}` : '—' },
  draft: { label: { ja: 'スリップストリーム', en: 'Slipstream' }, hint: { ja: '前の車の5〜26m後ろで最高速が上がる', en: 'Extra top speed 5–26 m behind a car' }, show: t => t.draft ? `+${kmh(t.draft)} km/h` : '—' },
  driftCharge: { label: { ja: 'ドリフト充電', en: 'Drift charge' }, hint: { ja: 'きついコーナーをドリフトで抜けると毎秒ターボが溜まる', en: 'Turbo refilled each second drifting through a tight corner' }, show: t => t.driftCharge ? `+${Math.round(spec(t).driftCharge * 3)}%` : '—' },
  steer: { label: { ja: 'ハンドルの切れ角', en: 'Steering lock' }, hint: { ja: 'ヘアピンや立て直しでの曲がり', en: 'Tight turns at low speed' }, show: t => percent(spec(t).steerLock, STOCK_SPEC.steerLock) },
  driftSteer: { label: { ja: 'ドリフトの滑り', en: 'Drift slide' }, hint: { ja: 'ドリフト中に後輪が手放すグリップ', en: 'Rear grip let go in a drift' }, show: t => share(1 - spec(t).driftGrip) },
  cornerLoad: { label: { ja: 'タイヤのグリップ', en: 'Tyre grip' }, hint: { ja: 'コーナー・発進・立て直し', en: 'Corners, launches and recoveries' }, show: t => percent(spec(t).grip, STOCK_SPEC.grip) },
  windLoad: { label: { ja: '横風で流される力', en: 'Crosswind push' }, hint: { ja: '低いほど風に強い', en: 'Lower: steadier in wind' }, show: t => percent(t.windLoad, S.windLoad) },
  rainSteer: RAIN, wetDamping: RAIN,
  oilSteer: { label: { ja: '油膜のグリップ', en: 'Grip on oil' }, hint: { ja: '乾いた路面に対して', en: 'Share of the dry road’s' }, show: t => share(spec(t).oilGrip) },
  offroadLoss: { label: { ja: 'ガードレールでの失速', en: 'Rail scrape' }, hint: { ja: '低いほどガードレールに沿って速度を保つ', en: 'Lower: keeps speed along a guard rail' }, show: t => percent(spec(t).railFriction, STOCK_SPEC.railFriction) },
  treeLoss: DAMAGE, signLoss: DAMAGE, contactLoss: DAMAGE,
};
export const READING_FIELDS = Object.keys(READINGS) as (keyof CarTune)[];
export interface EffectLine {
  readonly field: keyof CarTune; readonly label: Bilingual; readonly hint: Bilingual;
  readonly before: string; readonly after: string; readonly better: boolean;
}
/** What changes between two cars, reading by reading: improvements first, then trade-offs.
 * Fields the driving model folds into one quantity (rain grip, damage per hit) share a line. */
export function effectLines(before: CarTune, after: CarTune): EffectLine[] {
  const lines: EffectLine[] = [];
  for (const field of READING_FIELDS.filter(field => before[field] !== after[field])) {
    const { label, hint, show } = READINGS[field]!;
    if (lines.some(line => line.label === label)) continue;
    lines.push({ field, label, hint, before: show(before), after: show(after), better: LOWER_IS_BETTER.has(field) ? after[field] < before[field] : after[field] > before[field] });
  }
  return [...lines.filter(line => line.better), ...lines.filter(line => !line.better)];
}

/** Seconds a race each part saves on Hakone, Yokohama and Nikko (track order) for the drivers
 * its `bestFor` tag names, measured on the driving model along its unlock path: on a clear
 * road, or in a club-night pack for the parts whose tag is pack racing. `npm run balance:garage`
 * measures them; tests/garage-balance.test.ts holds these values to its report.
 */
export const RACE_GAINS: Readonly<Record<string, readonly [number, number, number]>> = {
  'engine-intake': [0.6, 0.8, 0.6], 'engine-cams': [0.7, 0.8, 0.6], 'engine-highrev': [0.9, 1.3, 0.8], 'engine-torque': [0.8, 1.1, 0.8], 'engine-fulltune': [0.6, 0.7, 0.5],
  'turbo-controller': [0.8, 1.2, 0.5], 'turbo-intercooler': [1.2, 1.2, 1.2], 'turbo-big': [1.7, 1.8, 1.5], 'turbo-twin': [1.9, 2, 1.8], 'turbo-antilag': [2.6, 2.7, 2.4],
  'chassis-tyres': [0.2, 0.3, 0.3], 'chassis-coilovers': [0.1, 0.2, 0.1], 'chassis-touge': [0.8, 0.8, 1.1], 'chassis-rally': [0.3, 0.7, 0.2], 'chassis-lsd': [0.6, 1.4, 1.7],
  'body-cage': [0.1, 0.1, 0.2], 'body-bumpers': [0.1, 0.3, 0], 'body-light': [0.4, 0.5, 0.5], 'body-armor': [0.1, 0.1, 0.1], 'body-windtunnel': [0.7, 1, 0.6],
};
