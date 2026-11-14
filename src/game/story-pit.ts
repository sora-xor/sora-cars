import { arcadeEnvironmentAt, environmentAt } from './environment';
import { buildValue, fittedParts, partState, storyRivals, techNode, type BranchId, type GarageSave, type RivalStyle, type TechNode } from './garage-tech';
import { RULES, TRACKS } from './rules';
import { CHAPTERS, RIVALS, storyGrid, storyObjective, type Bilingual, type StoryChapter } from './story';

// The pre-race garage that follows a story chapter's opening cutscenes: tonight's
// course, the objective, how far the rivals have tuned, and the crew's next pick.

export type WindLevel = 'light' | 'gusty' | 'strong';
export interface CourseConditions {
  /** Share of a typical race run in rain, in percent rounded to 5. */
  readonly rain: number;
  readonly wind: WindLevel;
  /** Roadside objects on one lap. */
  readonly trees: number; readonly signs: number; readonly oil: number;
}
/** How long a stock car's race lasts on each Arcade course's real road (seconds): eight stock cars take 2:44–2:56 at
 * Hakone, 2:24–2:38 in Yokohama and 1:23–1:30 at Nikkō (`npm run check:drive`). */
const STOCK_RACE_SECONDS: readonly number[] = [170, 150, 87];
/** Read from the native environment over a stock car's race. */
export function courseConditions(trackId: number): CourseConditions {
  const track = TRACKS[trackId];
  if (!track) throw new RangeError('Unknown course');
  const ticks = STOCK_RACE_SECONDS[trackId]! * 30;
  let rainy = 0, wind = 0;
  for (let tick = 0; tick < ticks; tick++) { const env = arcadeEnvironmentAt(trackId, tick); rainy += env.rain; wind = Math.max(wind, Math.abs(env.wind)); }
  const objects = environmentAt(trackId, 0).objects, perLap = (kind: string) => objects.filter(object => object.kind === kind).length / RULES.laps;
  return { rain: Math.round(rainy * 20 / ticks) * 5, wind: wind > 16 ? 'strong' : wind > 8 ? 'gusty' : 'light', trees: perLap('tree'), signs: perLap('sign'), oil: perLap('oil') };
}

export interface CourseTip {
  /** Crew member who briefs the course. The player drives Aki's car. */
  readonly crew: string;
  readonly line: Bilingual;
  /** Branches the line recommends. */
  readonly branches: readonly BranchId[];
  /** Purchase order. On Hakone's and Yokohama's first nights, what it buys must
   * meet the objective as often as anything else the money could do, for a rookie
   * on the crew's picks (PLAN_VISITS, `tests/story-pit-balance.test.ts`).
   */
  readonly plan: readonly string[];
}
/** By track id. */
export const COURSE_TIPS: readonly CourseTip[] = [
  {
    crew: 'yui', branches: ['chassis', 'body'],
    line: { ja: '箱根はカーブとヘアピンの連続。計算だと、タイヤのグリップと立ち上がりがそのままタイムになる。', en: 'Hakone is bend after bend, and a hairpin. By my numbers, tyre grip and pull out of the corners turn straight into time.' },
    plan: ['chassis-tyres', 'body-cage', 'chassis-coilovers', 'body-bumpers', 'body-armor', 'chassis-rally', 'engine-intake', 'turbo-controller', 'engine-cams', 'engine-torque', 'turbo-intercooler', 'turbo-twin', 'chassis-lsd', 'engine-fulltune', 'turbo-antilag', 'body-windtunnel'],
  },
  {
    crew: 'daichi', branches: ['body', 'chassis'],
    line: { ja: '港は直線と直角コーナー、それに雨だ。まずはケージとタイヤで足元を固めよう。焦らなくていい。前が空いてから踏もう。', en: 'The harbor is straights, square corners and rain. Firm the car up first: cage, then tyres. No need to rush. Get on the throttle once there’s room ahead.' },
    plan: ['body-cage', 'chassis-tyres', 'engine-intake', 'turbo-controller', 'chassis-coilovers', 'body-bumpers', 'body-armor', 'chassis-rally', 'engine-cams', 'engine-torque', 'turbo-intercooler', 'turbo-twin', 'engine-fulltune', 'chassis-lsd', 'turbo-antilag', 'body-windtunnel'],
  },
  {
    crew: 'jun', branches: ['turbo', 'engine'],
    line: { ja: '日光は長い直線から上り坂。稼ぎどころは直線だから、ブーストとエンジンだ。親父さんのノートにも、そう書いてある。', en: 'Nikko is a long straight, then the climb. The straight is where the time is, so it’s boost and engine. Your dad’s notebook says the same.' },
    plan: ['turbo-controller', 'engine-intake', 'body-cage', 'chassis-tyres', 'turbo-intercooler', 'engine-cams', 'chassis-coilovers', 'body-bumpers', 'body-armor', 'chassis-rally', 'engine-torque', 'turbo-twin', 'engine-fulltune', 'turbo-antilag', 'chassis-lsd', 'body-windtunnel'],
  },
];
export const courseTip = (trackId: number): CourseTip => {
  const tip = COURSE_TIPS[trackId];
  if (!tip) throw new RangeError('Unknown course');
  return tip;
};
/** The first step of the course plan the car still lacks: a part to buy (still shown
 * when unaffordable, to save up for), or a stored setup option to swap back in for
 * free. A fork the player settled on the other option is respected.
 */
export function nextPick(save: GarageSave, trackId: number): TechNode | null {
  for (const id of courseTip(trackId).plan) {
    const node = techNode(id)!, state = partState(save, id);
    if (state === 'stored') return node;
    if (state === 'fitted' || node.fork && save.owned.some(owned => techNode(owned)!.fork === node.fork)) continue;
    if (state === 'available' || state === 'short') return node;
  }
  return null;
}

export interface PitRival {
  readonly name: Bilingual;
  /** Purchase order, or null for a stock car. */
  readonly style: RivalStyle | null;
  readonly value: number;
}
export interface PitBriefing {
  readonly chapter: StoryChapter;
  /** The chapter's Arcade circuit. */
  readonly trackId: number;
  readonly conditions: CourseConditions;
  readonly objective: Bilingual;
  /** The two non-crew cars. The five crew cars are always stock. */
  readonly rivals: readonly PitRival[];
  readonly tip: CourseTip;
  readonly pick: TechNode | null;
  /** Value of the player's fitted parts; zero with equal cars. */
  readonly build: number;
}
/** As `storyRivals` builds them: Rei Sorashiro boost, Toru Amamiya power. */
const STORY_RIVAL_SLOTS = [
  { slot: 5, rival: RIVALS[0]!, style: 'boost', stand: { ja: '港のドライバー', en: 'HARBOR DRIVER' } },
  { slot: 7, rival: RIVALS[1]!, style: 'power', stand: { ja: 'SORAゲスト', en: 'SORA GUEST' } },
] as const;
const plainName = (name: Bilingual): Bilingual => ({ ja: name.ja.replace(/（.*?）/, ''), en: name.en });
/** `chapterIndex` is the chapter's place in play order. Street-race chapters have no pre-race garage. */
export function pitBriefing(chapterIndex: number, save: GarageSave): PitBriefing {
  const chapter = CHAPTERS[chapterIndex];
  if (!chapter || chapter.trackId === undefined) throw new RangeError('Unknown Arcade chapter');
  const trackId = chapter.trackId, grid = storyGrid(chapterIndex), rivals = storyRivals(chapter.id, grid.length, grid.indexOf('YOU'));
  return {
    chapter, trackId, conditions: courseConditions(trackId), objective: storyObjective(chapterIndex), tip: courseTip(trackId), pick: nextPick(save, trackId),
    build: save.stock ? 0 : buildValue(fittedParts(save)),
    rivals: STORY_RIVAL_SLOTS.map(({ slot, rival, style, stand }) => {
      const value = save.stock ? 0 : rivals[slot]!.value;
      return { name: grid[slot] === rival.name.ja ? plainName(rival.name) : stand, style: value ? style : null, value };
    }),
  };
}
