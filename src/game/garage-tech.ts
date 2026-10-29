import type { Bilingual } from './story';
import type { DriverSkill } from './garage-ai';
import { STOCK_TUNE, TUNE_BOUNDS, TUNE_FIELDS, type CarTune } from './tuned-engine';

/** The SORA Garage tech tree. Parts are bought with prize money from local
 * practice and story races and change only those garage races. Live XOR races
 * keep RaceV1's equal-performance car.
 */
export type BranchId = 'engine' | 'turbo' | 'chassis' | 'body';
/** Who gets the most from a part. Balance tests hold every tag to its promise. */
export type PartAudience = 'everyone' | 'boost' | 'drift' | 'recovery' | 'traffic' | 'clean';
export type TuneEffects = Partial<Record<keyof CarTune, number>>;
export interface TechBranch { readonly id: BranchId; readonly name: Bilingual; readonly crew: string; readonly role: Bilingual }
export interface TechNode {
  readonly id: string; readonly branch: BranchId; readonly tier: 1 | 2 | 3 | 4;
  /** Parts sharing a fork are alternative setups: own both, run one. */
  readonly fork?: string;
  readonly name: Bilingual; readonly note: Bilingual; readonly bestFor: PartAudience;
  readonly cost: number;
  /** Every listed part, plus at least one of `requiresAny` when present. */
  readonly requires: readonly string[]; readonly requiresAny?: readonly string[];
  readonly effects: TuneEffects;
}
export const AUDIENCES: Readonly<Record<PartAudience, Bilingual>> = {
  everyone: { ja: '誰にでも効く', en: 'EVERY DRIVER' }, boost: { ja: 'ブーストを使いこなす人に', en: 'BOOST USERS' },
  drift: { ja: 'ドリフトで走る人に', en: 'DRIFTERS' }, recovery: { ja: '雨・横風・コースアウトに', en: 'RAIN, WIND & RECOVERY' },
  traffic: { ja: '集団の中で', en: 'PACK RACING' }, clean: { ja: 'きれいに走れる人に', en: 'CLEAN DRIVERS' },
};
export const TECH_BRANCHES: readonly TechBranch[] = [
  { id: 'engine', name: { ja: 'エンジン', en: 'ENGINE' }, crew: 'aki', role: { ja: '最高速と加速。誰が乗っても効く。', en: 'Top speed and acceleration. Helps every driver.' } },
  { id: 'turbo', name: { ja: 'ターボ', en: 'TURBO' }, crew: 'jun', role: { ja: 'ブーストを長く、強く。使いどころを知る人ほど速い。', en: 'Longer, stronger boost. Rewards well-timed bursts.' } },
  { id: 'chassis', name: { ja: '足回り', en: 'CHASSIS' }, crew: 'daichi', role: { ja: 'コーナー・風・雨に強く。ドリフトでターボを溜める。', en: 'Steadier in corners, wind and rain. Drift to charge the turbo.' } },
  { id: 'body', name: { ja: 'ボディ', en: 'BODY' }, crew: 'yui', role: { ja: '接触や衝突に負けない。集団の中で速い。', en: 'Shrugs off contact and impacts. Quick in traffic.' } },
];
export const TECH_NODES: readonly TechNode[] = [
  { id: 'engine-intake', branch: 'engine', tier: 1, cost: 10000, requires: [], bestFor: 'everyone', effects: { topSpeed: 24, accel: 2 },
    name: { ja: '吸排気チューン', en: 'INTAKE & EXHAUST' }, note: { ja: '最高速と加速が少し伸びる。', en: 'A little more top speed and pull.' } },
  { id: 'engine-cams', branch: 'engine', tier: 2, cost: 24000, requires: ['engine-intake'], bestFor: 'everyone', effects: { topSpeed: 24, accel: 2 },
    name: { ja: 'ハイカム＆ポート研磨', en: 'CAMS & PORTED HEAD' }, note: { ja: '回転の上まで力が続く。', en: 'Power that keeps building up the rev range.' } },
  { id: 'engine-highrev', branch: 'engine', tier: 3, fork: 'engine-spec', cost: 52000, requires: ['engine-cams'], bestFor: 'clean', effects: { topSpeed: 48, accel: -2 },
    name: { ja: '高回転仕様', en: 'HIGH-REV SIX' }, note: { ja: '直線でよく伸びる。立て直しは少し鈍い。', en: 'Pulls hard on straights; slower to recover.' } },
  { id: 'engine-torque', branch: 'engine', tier: 3, fork: 'engine-spec', cost: 52000, requires: ['engine-cams'], bestFor: 'recovery', effects: { topSpeed: 18, accel: 12, traction: 20 },
    name: { ja: '低速トルク仕様', en: 'TORQUE SIX' }, note: { ja: '出だしと立て直しが速い。', en: 'Quick launches and recoveries.' } },
  { id: 'engine-fulltune', branch: 'engine', tier: 4, cost: 96000, requires: ['turbo-intercooler'], requiresAny: ['engine-highrev', 'engine-torque'], bestFor: 'everyone', effects: { topSpeed: 24, accel: 3 },
    name: { ja: 'フルチューン直6', en: 'FULL-TUNE SIX' }, note: { ja: '組み上げた直6の完成形。', en: 'The finished, blueprinted straight six.' } },

  { id: 'turbo-controller', branch: 'turbo', tier: 1, cost: 7000, requires: [], bestFor: 'boost', effects: { boostCost: -4 },
    name: { ja: 'ブーストコントローラー', en: 'BOOST CONTROLLER' }, note: { ja: '1回のブーストが長く続く。', en: 'Each burst lasts longer.' } },
  { id: 'turbo-intercooler', branch: 'turbo', tier: 2, cost: 20000, requires: ['turbo-controller'], bestFor: 'boost', effects: { boostRecharge: 1, boostSpeed: 60 },
    name: { ja: 'インタークーラー', en: 'INTERCOOLER' }, note: { ja: 'ブーストの回復が早く、少し強い。', en: 'Faster refill and a little more boost speed.' } },
  { id: 'turbo-big', branch: 'turbo', tier: 3, fork: 'turbo-spec', cost: 46000, requires: ['turbo-intercooler'], bestFor: 'boost', effects: { boostSpeed: 420 },
    name: { ja: '大型タービン', en: 'BIG TURBINE' }, note: { ja: 'ブースト中の最高速が大きく伸びる。', en: 'Much higher speed while boosting.' } },
  { id: 'turbo-twin', branch: 'turbo', tier: 3, fork: 'turbo-spec', cost: 46000, requires: ['turbo-intercooler'], bestFor: 'boost', effects: { boostCost: -3, boostRecharge: 1 },
    name: { ja: 'ツインターボ', en: 'TWIN TURBO' }, note: { ja: '長く、何度もブーストできる。', en: 'Boost longer and more often.' } },
  { id: 'turbo-antilag', branch: 'turbo', tier: 4, cost: 88000, requires: ['engine-cams'], requiresAny: ['turbo-big', 'turbo-twin'], bestFor: 'boost', effects: { boostKick: 20, boostCost: -2 },
    name: { ja: 'アンチラグ', en: 'ANTI-LAG' }, note: { ja: 'ブーストが一瞬で立ち上がる。', en: 'Boost reaches full speed almost at once.' } },

  { id: 'chassis-tyres', branch: 'chassis', tier: 1, cost: 6000, requires: [], bestFor: 'everyone', effects: { cornerLoad: -2, oilSteer: 4, traction: 6 },
    name: { ja: 'スポーツタイヤ', en: 'SPORT TYRES' }, note: { ja: 'コーナーと油膜で踏ん張り、出だしも良い。', en: 'Bite in corners and on oil; better launches.' } },
  { id: 'chassis-coilovers', branch: 'chassis', tier: 2, cost: 16000, requires: ['chassis-tyres'], bestFor: 'recovery', effects: { cornerLoad: -2, windLoad: -4, steer: 2, driftSteer: 4, accel: 1 },
    name: { ja: '車高調', en: 'COILOVERS' }, note: { ja: '横風とコーナーで流されにくい。', en: 'Less push from corners and crosswinds.' } },
  { id: 'chassis-touge', branch: 'chassis', tier: 3, fork: 'chassis-spec', cost: 40000, requires: ['chassis-coilovers'], bestFor: 'drift', effects: { driftCharge: 12, driftSteer: 4, steer: 2 },
    name: { ja: '峠セッティング', en: 'TOUGE SETUP' }, note: { ja: 'コーナーでドリフトを保つとターボが溜まる。', en: 'Hold a drift through corners to refill the turbo.' } },
  { id: 'chassis-rally', branch: 'chassis', tier: 3, fork: 'chassis-spec', cost: 28000, requires: ['chassis-coilovers'], bestFor: 'recovery', effects: { offroadLoss: -20, rainSteer: 4, wetDamping: -1, windLoad: -4, cornerLoad: -2, traction: 8 },
    name: { ja: 'ラリーセッティング', en: 'RALLY SETUP' }, note: { ja: 'コース外・雨・横風でも失速しにくい。', en: 'Keeps speed off the road, in rain and in wind.' } },
  { id: 'chassis-lsd', branch: 'chassis', tier: 4, cost: 80000, requires: ['turbo-controller'], requiresAny: ['chassis-touge', 'chassis-rally'], bestFor: 'drift', effects: { driftCharge: 8, accel: 4 },
    name: { ja: '機械式LSD', en: 'MECHANICAL LSD' }, note: { ja: '立ち上がりが鋭く、ドリフトでターボが溜まる。', en: 'Sharper exits; drifting refills the turbo.' } },

  { id: 'body-cage', branch: 'body', tier: 1, cost: 6000, requires: [], bestFor: 'traffic', effects: { contactLoss: -25, treeLoss: -200, signLoss: -80 },
    name: { ja: 'ロールケージ', en: 'ROLL CAGE' }, note: { ja: '接触や衝突で失う速度が減る。', en: 'Lose less speed to contact and impacts.' } },
  { id: 'body-bumpers', branch: 'body', tier: 2, cost: 10000, requires: ['body-cage'], bestFor: 'traffic', effects: { contactLoss: -25, signLoss: -40, traction: 10 },
    name: { ja: '強化バンパー', en: 'REINFORCED BUMPERS' }, note: { ja: '押し合いに強く、立て直しが早い。', en: 'Stronger in a shove; quicker to recover.' } },
  { id: 'body-light', branch: 'body', tier: 3, fork: 'body-spec', cost: 36000, requires: ['body-bumpers'], bestFor: 'clean', effects: { accel: 8, topSpeed: 12, treeLoss: 150, signLoss: 60, offroadLoss: 15 },
    name: { ja: '軽量化', en: 'LIGHTWEIGHT' }, note: { ja: '加速が鋭い。コース外や衝突に弱い。', en: 'Sharp acceleration; punished by off-road trips and impacts.' } },
  { id: 'body-armor', branch: 'body', tier: 3, fork: 'body-spec', cost: 42000, requires: ['body-bumpers'], bestFor: 'recovery', effects: { contactLoss: -30, offroadLoss: -25, treeLoss: -150, signLoss: -80, traction: 10 },
    name: { ja: '鉄板補強', en: 'STEEL ARMOR' }, note: { ja: '何があっても速度を保つ。', en: 'Holds speed through almost anything.' } },
  { id: 'body-windtunnel', branch: 'body', tier: 4, cost: 78000, requires: ['chassis-coilovers'], requiresAny: ['body-light', 'body-armor'], bestFor: 'everyone', effects: { draft: 160, windLoad: -4, topSpeed: 24 },
    name: { ja: '風洞仕上げ', en: 'WIND-TUNNEL BODY' }, note: { ja: '空気抵抗が減り、前の車の真後ろで加速する。', en: 'Less drag; slipstream right behind another car.' } },
];
const nodes = new Map(TECH_NODES.map(node => [node.id, node]));
export const techNode = (id: string): TechNode | undefined => nodes.get(id);

/** STOCK_TUNE plus every listed part's effects, clamped to the engine's bounds. */
export function tuneFor(ids: Iterable<string>): CarTune {
  const tune: Record<keyof CarTune, number> = { ...STOCK_TUNE };
  for (const id of ids) {
    const node = nodes.get(id); if (!node) throw new RangeError(`Unknown garage part: ${id}`);
    for (const [field, delta] of Object.entries(node.effects) as [keyof CarTune, number][]) tune[field] += delta;
  }
  for (const field of TUNE_FIELDS) tune[field] = Math.min(TUNE_BOUNDS[field][1], Math.max(TUNE_BOUNDS[field][0], tune[field]));
  return Object.freeze(tune);
}
export const buildValue = (ids: Iterable<string>): number => [...ids].reduce((sum, id) => sum + (nodes.get(id)?.cost ?? 0), 0);

// ---- Saved garage ------------------------------------------------------------

export type FieldId = 'club' | 'touge' | 'championship' | 'legends';
export interface GarageSave {
  readonly version: 1;
  readonly money: number; readonly earned: number;
  readonly owned: readonly string[];
  /** Fork → the owned option currently fitted. */
  readonly setup: Readonly<Record<string, string>>;
  /** Run the equal-performance stock car in practice and story. */
  readonly stock: boolean;
  readonly fields: readonly FieldId[];
  /** Story chapters whose one-time clear bonus has been paid. */
  readonly cleared: readonly number[];
}
/** Enough for one first-tier part, so the first visit can start the build. */
export const STARTING_FUNDS = 12000;
export const MAX_FUNDS = 99_999_999;
export const newGarage = (): GarageSave => ({ version: 1, money: STARTING_FUNDS, earned: 0, owned: [], setup: {}, stock: false, fields: ['club'], cleared: [] });

/** Restore local progress, dropping anything this build does not recognise. */
export function readGarage(value: unknown): GarageSave {
  const fresh = newGarage();
  if (!value || typeof value !== 'object' || (value as GarageSave).version !== 1) return fresh;
  const v = value as Partial<GarageSave>;
  const money = Number.isSafeInteger(v.money) && v.money! >= 0 ? Math.min(v.money!, MAX_FUNDS) : fresh.money;
  const earned = Number.isSafeInteger(v.earned) && v.earned! >= 0 ? v.earned! : 0;
  const known = Array.isArray(v.owned) ? [...new Set(v.owned.filter((id): id is string => typeof id === 'string' && nodes.has(id)))] : [];
  // A part survives only if its requirements survive, so the tree stays consistent.
  const owned: string[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const id of known) if (!owned.includes(id) && requirementsMet(owned, nodes.get(id)!)) { owned.push(id); changed = true; }
  }
  const setup: Record<string, string> = {};
  for (const node of TECH_NODES) if (node.fork && owned.includes(node.id) && !setup[node.fork]) setup[node.fork] = node.id;
  if (v.setup && typeof v.setup === 'object') for (const [fork, id] of Object.entries(v.setup)) if (nodes.get(id)?.fork === fork && owned.includes(id)) setup[fork] = id;
  const fields = PRACTICE_FIELDS.filter(field => field.id === 'club' || Array.isArray(v.fields) && v.fields.includes(field.id)).map(field => field.id);
  const cleared = Array.isArray(v.cleared) ? [...new Set(v.cleared.filter(n => Number.isInteger(n) && n >= 0 && n < 64))].sort((a, b) => a - b) : [];
  return { version: 1, money, earned, owned: TECH_NODES.filter(node => owned.includes(node.id)).map(node => node.id), setup, stock: v.stock === true, fields, cleared };
}
function requirementsMet(owned: readonly string[], node: TechNode): boolean {
  return node.requires.every(id => owned.includes(id)) && (!node.requiresAny || node.requiresAny.some(id => owned.includes(id)));
}
export function missingParts(save: GarageSave, id: string): TechNode[] {
  const node = nodes.get(id); if (!node) return [];
  const missing = node.requires.filter(req => !save.owned.includes(req));
  if (node.requiresAny && !node.requiresAny.some(req => save.owned.includes(req))) missing.push(node.requiresAny[0]!);
  return missing.map(req => nodes.get(req)!);
}
export type PartState = 'fitted' | 'stored' | 'available' | 'short' | 'locked';
/** Fitted parts change the car; a stored part is the unused option of an owned fork. */
export function partState(save: GarageSave, id: string): PartState {
  const node = nodes.get(id); if (!node) throw new RangeError(`Unknown garage part: ${id}`);
  if (save.owned.includes(id)) return !node.fork || save.setup[node.fork] === id ? 'fitted' : 'stored';
  if (!requirementsMet(save.owned, node)) return 'locked';
  return save.money >= node.cost ? 'available' : 'short';
}
export function buyPart(save: GarageSave, id: string): GarageSave {
  const node = nodes.get(id), state = node && partState(save, id);
  if (!node || state === 'fitted' || state === 'stored') throw new Error('この部品はもう持っています。 / You already own this part.');
  if (state === 'locked') throw new Error('先に必要な部品を組もう。 / Fit the required parts first.');
  if (state === 'short') throw new Error('賞金が足りません。 / Not enough prize money yet.');
  return { ...save, money: save.money - node.cost, owned: TECH_NODES.filter(n => n.id === id || save.owned.includes(n.id)).map(n => n.id), setup: node.fork ? { ...save.setup, [node.fork]: id } : save.setup };
}
/** Swap an owned fork option into the car. */
export function fitPart(save: GarageSave, id: string): GarageSave {
  const node = nodes.get(id);
  if (!node?.fork || !save.owned.includes(id)) throw new Error('持っている選択式の部品だけ付け替えられます。 / Only owned setup options can be swapped.');
  return { ...save, setup: { ...save.setup, [node.fork]: id } };
}
export function fittedParts(save: GarageSave): string[] { return save.owned.filter(id => partState(save, id) === 'fitted'); }
/** The car a garage race uses: stock when the driver chose equal performance. */
export function garageTune(save: GarageSave): CarTune { return save.stock ? STOCK_TUNE : tuneFor(fittedParts(save)); }

// ---- Opponents --------------------------------------------------------------------

/** Purchase orders for opponent builds. Only one option of each fork appears in a list. */
export type RivalStyle = 'power' | 'boost' | 'tough';
const STYLE_ORDER: Readonly<Record<RivalStyle, readonly string[]>> = {
  power: ['engine-intake', 'body-cage', 'engine-cams', 'chassis-tyres', 'engine-highrev', 'body-bumpers', 'turbo-controller', 'turbo-intercooler', 'body-light', 'engine-fulltune', 'chassis-coilovers', 'body-windtunnel', 'turbo-big', 'turbo-antilag', 'chassis-rally', 'chassis-lsd'],
  boost: ['turbo-controller', 'engine-intake', 'turbo-intercooler', 'body-cage', 'turbo-twin', 'engine-cams', 'chassis-tyres', 'turbo-antilag', 'engine-highrev', 'body-bumpers', 'engine-fulltune', 'body-light', 'chassis-coilovers', 'body-windtunnel', 'chassis-rally', 'chassis-lsd'],
  tough: ['body-cage', 'engine-intake', 'body-bumpers', 'chassis-tyres', 'engine-cams', 'body-armor', 'chassis-coilovers', 'engine-torque', 'turbo-controller', 'turbo-intercooler', 'chassis-rally', 'engine-fulltune', 'body-windtunnel', 'turbo-twin', 'turbo-antilag', 'chassis-lsd'],
};
/** Buy down the style's list within budget, skipping parts not yet unlockable. */
export function rivalBuild(style: RivalStyle, budget: number): string[] {
  const owned: string[] = []; let left = budget;
  for (let bought = true; bought;) {
    bought = false;
    for (const id of STYLE_ORDER[style]) {
      const node = nodes.get(id)!;
      if (!owned.includes(id) && node.cost <= left && requirementsMet(owned, node)) { owned.push(id); left -= node.cost; bought = true; break; }
    }
  }
  return owned;
}
export interface Rival { readonly skill: DriverSkill; readonly tune: CarTune; readonly value: number }
export interface PracticeField {
  readonly id: FieldId; readonly name: Bilingual; readonly note: Bilingual;
  /** Purse multiplier in percent. */
  readonly prize: number;
  /** Typical rival build value; the grid spreads from 40% to 160% of it. */
  readonly budget: number;
  readonly skills: readonly DriverSkill[]; readonly styles: readonly RivalStyle[];
}
export const PRACTICE_FIELDS: readonly PracticeField[] = [
  { id: 'club', name: { ja: 'クラブ走行会', en: 'CLUB NIGHT' }, note: { ja: '仲間はノーマル車。まずはここから。', en: 'Your crew in stock cars. Start here.' }, prize: 100, budget: 0, skills: ['club'], styles: ['power'] },
  { id: 'touge', name: { ja: '峠バトル', en: 'TOUGE BATTLE' }, note: { ja: '手を入れた車が混じる。', en: 'Some rivals have started tuning.' }, prize: 160, budget: 60000, skills: ['club', 'pro'], styles: ['power', 'tough', 'boost'] },
  { id: 'championship', name: { ja: '選手権', en: 'CHAMPIONSHIP' }, note: { ja: '本気のチューンと本気の走り。', en: 'Serious builds, serious drivers.' }, prize: 240, budget: 180000, skills: ['pro'], styles: ['boost', 'power', 'tough'] },
  { id: 'legends', name: { ja: '伝説の夜', en: 'LEGENDS' }, note: { ja: '完成した車と、峠の伝説たち。', en: 'Finished machines and touge legends.' }, prize: 340, budget: 420000, skills: ['pro', 'ace'], styles: ['power', 'boost', 'tough'] },
];
export const practiceField = (id: FieldId): PracticeField => PRACTICE_FIELDS.find(field => field.id === id) ?? PRACTICE_FIELDS[0]!;
/** Rivals for every slot except the player's, strongest builds spread through the grid. */
export function fieldRivals(id: FieldId, players: number, playerSlot: number): (Rival | null)[] {
  const field = practiceField(id);
  let index = 0;
  return Array.from({ length: players }, (_, slot) => {
    if (slot === playerSlot) return null;
    const i = index++, spread = 40 + Math.round(120 * i / Math.max(1, players - 2));
    const build = rivalBuild(field.styles[i % field.styles.length]!, Math.round(field.budget * spread / 100));
    return { skill: field.skills[i % field.skills.length]!, tune: tuneFor(build), value: buildValue(build) };
  });
}
/** Rival build budgets by chapter, in thousands of yen. Rei Sorashiro races from
 * chapter 3 and Toru Amamiya from chapter 4, matching the story grid. Every chapter
 * opens with the pre-race garage, so the budgets assume a player who upgrades:
 * Rei keeps pace with the crew's picks and contests the lead through Act 3.
 * Toru drives his best race in the showdown (chapter 11), which needs parts.
 */
export const STORY_REI = [0, 0, 10, 20, 35, 60, 100, 120, 150, 170, 190, 210] as const;
export const STORY_TORU = [0, 0, 0, 10, 20, 30, 40, 50, 60, 70, 90, 100] as const;
/** Story rivals tune up as the plot escalates; the crew drive stock cars. */
export function storyRivals(chapter: number, players: number, playerSlot: number, reiSlot = 5, toruSlot = 7): (Rival | null)[] {
  const rei = (STORY_REI[chapter] ?? 0) * 1000, toru = (STORY_TORU[chapter] ?? 0) * 1000;
  return Array.from({ length: players }, (_, slot): Rival | null => {
    if (slot === playerSlot) return null;
    const build = slot === reiSlot ? rivalBuild('boost', rei) : slot === toruSlot ? rivalBuild('power', toru) : [];
    return { skill: slot === reiSlot && rei || slot === toruSlot && chapter === 10 ? 'pro' : 'club', tune: tuneFor(build), value: buildValue(build) };
  });
}

// ---- Prize money -------------------------------------------------------------------

/** 8-car purse by finishing place. Smaller grids use the matching share of the scale. */
export const PURSE: readonly number[] = [6000, 4500, 3500, 2800, 2200, 1700, 1300, 1000];
export const CLEAN_BONUS = 1000;
export const storyClearBonus = (chapter: number): number => 8000 + chapter * 1500;
export interface RaceAward {
  readonly purse: number; readonly clean: number; readonly chapter: number;
  readonly total: number; readonly unlocked: FieldId | null;
}
export interface RaceOutcome {
  readonly place: number; readonly cars: number;
  /** Practice field, or null for a story chapter. */
  readonly field: FieldId | null; readonly chapter?: number; readonly objective?: boolean;
  /** No tree or sign impacts and at most one second off the road. */
  readonly clean: boolean;
}
export function raceAward(save: GarageSave, outcome: RaceOutcome): RaceAward {
  const { place, cars, field } = outcome;
  if (!Number.isInteger(cars) || cars < 2 || cars > 8 || !Number.isInteger(place) || place < 1 || place > cars) throw new RangeError('Invalid race placing');
  const percent = field ? practiceField(field).prize : 120;
  const share = PURSE[Math.round((place - 1) * (PURSE.length - 1) / (cars - 1))]!;
  const purse = Math.round(share * percent / 100), clean = outcome.clean ? Math.round(CLEAN_BONUS * percent / 100) : 0;
  const chapter = field === null && outcome.objective && Number.isInteger(outcome.chapter) && !save.cleared.includes(outcome.chapter!) ? storyClearBonus(outcome.chapter!) : 0;
  const next = field && place <= 3 ? PRACTICE_FIELDS[PRACTICE_FIELDS.findIndex(f => f.id === field) + 1]?.id ?? null : null;
  return { purse, clean, chapter, total: purse + clean + chapter, unlocked: next && !save.fields.includes(next) ? next : null };
}
export function applyAward(save: GarageSave, award: RaceAward, chapter?: number): GarageSave {
  return {
    ...save, money: Math.min(MAX_FUNDS, save.money + award.total), earned: save.earned + award.total,
    fields: award.unlocked ? PRACTICE_FIELDS.filter(f => save.fields.includes(f.id) || f.id === award.unlocked).map(f => f.id) : save.fields,
    cleared: award.chapter && chapter !== undefined ? [...save.cleared, chapter].sort((a, b) => a - b) : save.cleared,
  };
}
