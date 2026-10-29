import cutArt from './story-cut-art.json';
import type { Bilingual } from './story';

export const STORY_SCENES = {
  garage: { art: 'garage-dusk-branded.png', effect: 'workshop', place: 'SORA ガレージ', english: 'SORA GARAGE' },
  ledger: { art: 'ledger-night-v1.png', effect: 'workshop', place: '空本工房・作業机', english: 'SORAMOTO WORKSHOP · THE LEDGER' },
  radio: { art: 'radio-rain-v1.png', effect: 'radio', place: 'SORA レコード・放送室', english: 'SORA RECORDS · RADIO ROOM' },
  boardroom: { art: 'tower-boardroom-v2.png', effect: 'none', place: '天際開発・会議室', english: 'TENSAI DEVELOPMENT · BOARDROOM' },
  office: { art: 'credit-office-v2.png', effect: 'rain', place: '融資相談室', english: 'CREDIT OFFICE' },
  community: { art: 'community-dawn-v1.png', effect: 'dawn', place: 'SORA 商店街', english: 'SORA SHOPPING STREET' },
  harbor: { art: 'harbor-1986-v1.png', effect: 'rain', place: '横浜・港の集会所', english: 'YOKOHAMA · HARBOR MEET' },
  sunrise: { art: 'sunrise-crew-branded-v2-centered-v2.png', effect: 'dawn', place: '日光・峠の展望台', english: 'NIKKO · MOUNTAIN OVERLOOK' },
} as const;
export type StorySceneId = keyof typeof STORY_SCENES;
export type StoryShot = 'wide' | 'left' | 'right' | 'detail';

/** Each camera direction is a separately illustrated composition. */
const STORY_ANGLE_VERSIONS: Partial<Record<StorySceneId, number>> = { boardroom: 3, office: 3, harbor: 3, sunrise: 3 };
const STORY_ANGLE_OVERRIDES: Partial<Record<StorySceneId, Partial<Record<StoryShot, string>>>> = {
  "garage": {
    "detail": "angles/garage-detail-v2-centered-oct23-v1.png",
    "left": "angles/garage-left-v2-centered-oct23-v1.png"
  },
  "sunrise": {
    "detail": "angles/sunrise-detail-v3-centered-v2.png"
  }
};
export const STORY_ANGLE_ART = Object.fromEntries(Object.keys(STORY_SCENES).map(scene => [scene,
  Object.fromEntries(['wide', 'left', 'right', 'detail'].map(shot => [shot, STORY_ANGLE_OVERRIDES[scene as StorySceneId]?.[shot as StoryShot] ?? `angles/${scene}-${shot}-v${STORY_ANGLE_VERSIONS[scene as StorySceneId] ?? 2}.png`])),
])) as Record<StorySceneId, Record<StoryShot, string>>;

export const STORY_BEAT_ART = {
  'radio-near-confession': 'beats/radio-near-confession-v2.png',
  'radio-near-confession-reverse': 'beats/radio-near-confession-reverse-v2.png',
  'radio-umbrella': 'beats/radio-umbrella-v2.png',
  'radio-umbrella-reverse': 'beats/radio-umbrella-reverse-v2.png',
  'radio-phone-threat': 'beats/radio-phone-threat-v2.png',
  'radio-blackout': 'beats/radio-blackout-v2.png',
  'garage-blackout': 'beats/garage-blackout-v2.png',
  'garage-blackout-detail': 'beats/garage-blackout-detail-v2.png',
  'garage-blackout-reverse': 'beats/garage-blackout-reverse-v3.png',
  'radio-betrayal': 'beats/radio-betrayal-v2.png',
  'radio-betrayal-reverse': 'beats/radio-betrayal-reverse-v2.png',
  'radio-contract': 'beats/radio-contract-v2.png',
  'fathers-notebook': 'beats/fathers-notebook-v2.png',
  'fathers-notebook-reaction': 'beats/fathers-notebook-reaction-v2.png',
  'shared-prototype': 'beats/shared-prototype-v2.png',
  'sunrise-kiss': 'beats/sunrise-kiss-v3.png',
  'boardroom-key-offer': 'beats/boardroom-key-offer-v4.png',
  'boardroom-key-return': 'beats/boardroom-key-return-v4.png',
  'public-confession': 'beats/public-confession-v4.png',
  'public-confession-reverse': 'beats/public-confession-reverse-v4.png',
  'radio-jun-premiere': 'beats/radio-jun-premiere-v3.png',
  'radio-jun-premiere-reverse': 'beats/radio-jun-premiere-reverse-v3.png',
} as const;
export type StoryBeatArt = keyof typeof STORY_BEAT_ART;
export interface StoryFrame { scene: StorySceneId; shot: StoryShot; art: string; beat?: StoryBeatArt }
export const STORY_CUT_ART: Record<string, readonly string[]> = cutArt;

/** Every authored camera cut selects its own illustration; dialogue without a cut holds that image. */
export function resolveStoryFrame(lines: readonly { scene?: StorySceneId; shot?: StoryShot; art?: StoryBeatArt }[], index: number, sequence?: string): StoryFrame {
  const frame = resolveStoryShot(lines, index);
  let beat: StoryBeatArt | undefined;
  let cut = 0;
  for (const [i, line] of lines.slice(0, index + 1).entries()) {
    if (i > 0 && (line.scene !== undefined || line.shot !== undefined || line.art !== undefined)) cut++;
    if (line.scene !== undefined || line.shot !== undefined) beat = undefined;
    if (line.art !== undefined) beat = line.art;
  }
  const art = sequence ? STORY_CUT_ART[sequence]?.[cut] : undefined;
  if (sequence && !art) throw new Error(`Missing cutscene art for ${sequence} cut ${cut + 1}`);
  return { ...frame, art: art ?? (beat ? STORY_BEAT_ART[beat] : STORY_ANGLE_ART[frame.scene][frame.shot]), ...(beat ? { beat } : {}) };
}

/** A time/place caption holds for the rest of its shot; the next camera cut returns to the scene's own caption. */
export function resolveStorySetting(lines: readonly { scene?: StorySceneId; shot?: StoryShot; art?: StoryBeatArt; setting?: Bilingual }[], index: number): Bilingual {
  let setting: Bilingual | undefined;
  for (const [i, line] of lines.slice(0, index + 1).entries()) {
    if (i > 0 && (line.scene !== undefined || line.shot !== undefined || line.art !== undefined)) setting = undefined;
    if (line.setting) setting = line.setting;
  }
  const scene = STORY_SCENES[resolveStoryShot(lines, index).scene];
  return setting ?? { ja: scene.place, en: scene.english };
}

/** A shot holds until the script explicitly cuts. Back/log navigation uses the same direction. */
export function resolveStoryShot(lines: readonly { scene?: StorySceneId; shot?: StoryShot }[], index: number): { scene: StorySceneId; shot: StoryShot } {
  let scene: StorySceneId = 'garage', shot: StoryShot = 'wide';
  for (const line of lines.slice(0, index + 1)) {
    if (line.scene && line.scene !== scene) { scene = line.scene; shot = 'wide'; }
    if (line.shot) shot = line.shot;
  }
  return { scene, shot };
}
