import { environmentAt } from './environment';
import { buildValue, fittedParts, partState, storyRivals, techNode, type BranchId, type GarageSave, type RivalStyle, type TechNode } from './garage-tech';
import { RULES, TRACKS } from './rules';
import { CHAPTERS, RIVALS, storyGrid, storyObjective, type Bilingual, type StoryChapter } from './story';
import { STOCK_TUNE } from './tuned-engine';

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
/** Read from the native environment over a stock car's race distance. */
export function courseConditions(trackId: number): CourseConditions {
  const track = TRACKS[trackId];
  if (!track) throw new RangeError('Unknown course');
  const ticks = Math.ceil(track.length * RULES.laps / STOCK_TUNE.topSpeed);
  let rainy = 0, wind = 0;
  for (let tick = 0; tick < ticks; tick++) { const env = environmentAt(trackId, tick); rainy += env.rain; wind = Math.max(wind, Math.abs(env.wind)); }
  const objects = environmentAt(trackId, 0).objects, perLap = (kind: string) => objects.filter(object => object.kind === kind).length / RULES.laps;
  return { rain: Math.round(rainy * 20 / ticks) * 5, wind: wind > 16 ? 'strong' : wind > 8 ? 'gusty' : 'light', trees: perLap('tree'), signs: perLap('sign'), oil: perLap('oil') };
}

export interface CourseTip {
  /** Crew member who briefs the course. The player drives Aki's car. */
  readonly crew: string;
  readonly line: Bilingual;
  /** Branches the line recommends. */
  readonly branches: readonly BranchId[];
  /** Purchase order that saves rookie and regular drivers the most time per yen on
   * this course, re-measured after every part (`tests/story-pit-balance.test.ts`).
   */
  readonly plan: readonly string[];
}
/** By track id. */
export const COURSE_TIPS: readonly CourseTip[] = [
  {
    crew: 'yui', branches: ['turbo', 'engine'],
    line: { ja: '箱根のコーナーは流れるようにつながってる。計算だと、最高速とブーストがそのままタイムになる。', en: 'Hakone’s corners run into each other. By my numbers, top speed and boost turn straight into time.' },
    plan: ['turbo-controller', 'engine-intake', 'chassis-tyres', 'turbo-intercooler', 'engine-cams', 'turbo-big', 'engine-torque', 'body-cage', 'body-bumpers', 'body-light', 'chassis-coilovers', 'turbo-antilag', 'body-windtunnel', 'engine-fulltune', 'chassis-rally', 'chassis-lsd'],
  },
  {
    crew: 'daichi', branches: ['chassis'],
    line: { ja: '港は横風と雨だ。タイヤと足回りを固めれば、コースから外れない。僕も毎晩、それで帰ってきてる。', en: 'The harbor means crosswinds and rain. Firm up the tyres and suspension and you’ll stay on the road. It’s how I make it home every night.' },
    plan: ['chassis-tyres', 'engine-intake', 'chassis-coilovers', 'turbo-controller', 'turbo-intercooler', 'turbo-big', 'engine-cams', 'engine-torque', 'body-cage', 'body-bumpers', 'body-light', 'turbo-antilag', 'body-windtunnel', 'engine-fulltune', 'chassis-rally', 'chassis-lsd'],
  },
  {
    crew: 'jun', branches: ['turbo'],
    line: { ja: 'ヘアピンで落とした速度は、ブーストで取り返そう。親父さんのノートにも、そう書いてある。', en: 'Whatever the hairpins take, win it back with boost. Your dad’s notebook says the same.' },
    plan: ['turbo-controller', 'engine-intake', 'engine-cams', 'turbo-intercooler', 'turbo-big', 'engine-torque', 'chassis-tyres', 'body-cage', 'body-bumpers', 'body-light', 'engine-fulltune', 'turbo-antilag', 'chassis-coilovers', 'body-windtunnel', 'chassis-rally', 'chassis-lsd'],
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
export function pitBriefing(chapterId: number, save: GarageSave): PitBriefing {
  const chapter = CHAPTERS[chapterId];
  if (!chapter) throw new RangeError('Unknown chapter');
  const grid = storyGrid(chapterId), rivals = storyRivals(chapterId, grid.length, grid.indexOf('YOU'));
  return {
    chapter, conditions: courseConditions(chapter.trackId), objective: storyObjective(chapterId), tip: courseTip(chapter.trackId), pick: nextPick(save, chapter.trackId),
    build: save.stock ? 0 : buildValue(fittedParts(save)),
    rivals: STORY_RIVAL_SLOTS.map(({ slot, rival, style, stand }) => {
      const value = save.stock ? 0 : rivals[slot]!.value;
      return { name: grid[slot] === rival.name.ja ? plainName(rival.name) : stand, style: value ? style : null, value };
    }),
  };
}
