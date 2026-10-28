import type { Bilingual, Dialogue } from './story';
import type { StorySceneId, StoryShot, StoryBeatArt } from './story-scenes';

/** Omitted stage directions hold the current shot; setting captions apply to one line only. */
export const line = (speaker: string, ja: string, en: string, scene?: StorySceneId, shot?: StoryShot, art?: StoryBeatArt, setting?: Bilingual): Dialogue => ({ speaker, ja, en, scene, shot, art, setting });
