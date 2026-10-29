import type { StoryChapter } from './story';
import { ACT_ONE } from './story-campaign-act1';
import { ACT_TWO } from './story-campaign-act2';
import { ACT_THREE } from './story-campaign-act3';
import { AIZU, IROHAZAKA, KYOTO, NARA, TOKYO } from './story-campaign-roads';

const [rain, glass, blackout, night] = ACT_TWO as [StoryChapter, StoryChapter, StoryChapter, StoryChapter];
const [frequency, kings, dawn, sideB] = ACT_THREE as [StoryChapter, StoryChapter, StoryChapter, StoryChapter];

/** Original alternate-history 1986 fiction: departure, initiation, and return.
 * Play order. The street-race chapters sit where the story already travels:
 * Irohazaka in the week after the Nikko announcement, Tokyo before the Council's
 * summons, Aizu in the week of repairs, and Kyoto and Nara before the hearing.
 * The finale stays last. */
export const CAMPAIGN: readonly StoryChapter[] = [
  ...ACT_ONE, IROHAZAKA,
  rain, TOKYO, glass, blackout, night, AIZU,
  frequency, KYOTO, NARA, kings, dawn, sideB,
];
