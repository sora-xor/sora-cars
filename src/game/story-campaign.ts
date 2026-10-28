import type { StoryChapter } from './story';
import { ACT_ONE } from './story-campaign-act1';
import { ACT_TWO } from './story-campaign-act2';
import { ACT_THREE } from './story-campaign-act3';

/** Original alternate-history 1986 fiction: departure, initiation, and return. */
export const CAMPAIGN: readonly StoryChapter[] = [...ACT_ONE, ...ACT_TWO, ...ACT_THREE];
