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
    plan: ['engine-intake', 'turbo-controller', 'turbo-intercooler', 'chassis-tyres', 'turbo-big', 'chassis-coilovers', 'engine-cams', 'chassis-rally', 'turbo-antilag', 'body-cage', 'engine-torque', 'body-bumpers', 'body-armor', 'body-windtunnel', 'engine-fulltune', 'chassis-lsd'],
  },
  {
    crew: 'daichi', branches: ['turbo', 'chassis'],
    line: { ja: '港は横風と雨だ。まずはブーストで速さを稼いで、タイヤで路面をつかもう。エンジンと足回りはその次。そうすればコースから外れない。僕も毎晩、それで帰ってきてる。', en: 'The harbor means crosswinds and rain. Get your speed from the boost, grip the road with sport tyres, then add the engine and firm up the suspension, and you’ll stay on the road. It’s how I make it home every night.' },
    plan: ['turbo-controller', 'chassis-tyres', 'engine-intake', 'turbo-intercooler', 'body-cage', 'turbo-big', 'chassis-coilovers', 'chassis-rally', 'engine-cams', 'turbo-antilag', 'engine-torque', 'engine-fulltune', 'chassis-lsd', 'body-bumpers', 'body-armor', 'body-windtunnel'],
  },
  {
    crew: 'jun', branches: ['engine', 'turbo'],
    line: { ja: 'ヘアピンで落とした速度は、エンジンとブーストで取り返そう。親父さんのノートにも、そう書いてある。', en: 'Whatever the hairpins take, win it back with the engine and the boost. Your dad’s notebook says the same.' },
    plan: ['engine-intake', 'body-cage', 'turbo-controller', 'turbo-intercooler', 'chassis-tyres', 'chassis-coilovers', 'turbo-twin', 'engine-cams', 'chassis-rally', 'engine-highrev', 'engine-fulltune', 'body-bumpers', 'body-armor', 'turbo-antilag', 'body-windtunnel', 'chassis-lsd'],
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
