import type { StorySceneId, StoryShot } from './story-scenes';

export type CutscenePhase = 'intro' | 'victory' | 'retry';
export type ScoreMood = 'warm' | 'tense' | 'tender' | 'urgent' | 'grief' | 'hope';
export interface NarrativeBeat { from: number; track: number; narrative: string; mood: ScoreMood; entryBeat: number; }
const T = { promise: 9, deadline: 10, harbor: 11, evidence: 12, crown: 13, prototype: 14,
  rain: 15, glass: 16, relay: 17, blackout: 18, rebuild: 19, home: 20, freedom: 21, dawn: 22, jun: 23, love: 24 };
const beat = (from: number, track: number, narrative: string, mood: ScoreMood, entryBeat = 0): NarrativeBeat => ({ from, track, narrative, mood, entryBeat });
/** Deliberately spotted against the screenplay, zero-based dialogue positions.
 * Scene cuts alter instrumentation independently of these dramatic cue changes.
 * Entrances are quarter-note beats: 32 is the full statement, 64/96 the answer,
 * 128 the sparse middle, and 192 the lifted final answer. Reprises enter these
 * developed phrases so normal dialogue pacing does not only expose song intros. */
export const CUTSCENE_CUE_SHEETS: readonly { intro: readonly NarrativeBeat[]; victory: readonly NarrativeBeat[] }[] = [
  { intro: [beat(0, T.promise, 'The garage and the blank cassette', 'warm'), beat(3, T.deadline, 'The repayment deadline', 'tense'), beat(8, T.harbor, 'The crown reaches the harbor', 'tense'), beat(9, T.prototype, 'An invitation to the airwaves', 'hope'), beat(14, T.rebuild, 'The weight of her father’s workshop', 'tender')],
    victory: [beat(0, T.promise, 'A small victory at the workshop', 'warm'), beat(3, T.harbor, 'A brother and an unfinished car', 'tender'), beat(6, T.evidence, 'Two doors bear the same crown', 'tense'), beat(8, T.promise, 'Save a song on side B', 'tender')] },
  { intro: [beat(0, T.harbor, 'The depot wakes the city', 'warm'), beat(3, T.deadline, 'People outside the redevelopment picture', 'tense'), beat(7, T.rain, 'A postcard about sleepless nights', 'tender'), beat(11, T.prototype, 'Repair the brakes first', 'hope')],
    victory: [beat(0, T.harbor, 'Warm coffee and the returned keys', 'warm'), beat(3, T.home, 'The shopkeepers find a voice', 'hope'), beat(6, T.evidence, 'Rei names her own signature', 'tense')] },
  { intro: [beat(0, T.evidence, 'Reading Rei’s signed assessment', 'tense'), beat(4, T.crown, 'The CROWN withdrawal plan', 'tense'), beat(9, T.prototype, 'Yui reveals SORA X.O.R.', 'hope'), beat(12, T.rebuild, 'Her father’s borrowed vise', 'tender'), beat(15, T.freedom, 'Aki offers to handle the repair questions', 'hope')],
    victory: [beat(0, T.prototype, 'The prototype leaves the desk', 'hope'), beat(2, T.evidence, 'Who holds the recovery key', 'tense'), beat(6, T.glass, 'An invitation to a perfect workshop', 'tense'), beat(8, T.promise, 'An unfinished promise', 'tender')] },
  { intro: [beat(0, T.glass, 'Six lifts behind the glass', 'warm'), beat(4, T.crown, 'Exclusive rights and a master switch', 'tense'), beat(8, T.deadline, 'Toru remembers the factory closing', 'grief'), beat(12, T.freedom, 'The sign is not for sale', 'hope', 32)],
    victory: [beat(0, T.freedom, 'A public answer from the podium', 'hope', 64), beat(3, T.prototype, 'One more working terminal', 'warm'), beat(6, T.promise, 'Two voices shaking at sunrise', 'tender', 64)] },
  { intro: [beat(0, T.prototype, 'Receipts, breakfast and a rainy forecast', 'warm'), beat(5, T.rain, 'Move your chair closer', 'tender'), beat(8, T.rain, 'Admitting what they fear losing', 'grief'), beat(10, T.promise, 'I came looking for you', 'tender', 64), beat(12, T.rain, 'The long way home becomes a date', 'tender', 64)],
    victory: [beat(0, T.rain, 'One umbrella at the harbor', 'tender', 64), beat(4, T.promise, 'Almost saying it aloud', 'tender', 64), beat(5, T.glass, 'The sponsor calls about his mother', 'tense', 32), beat(8, T.deadline, 'Ren hides the shaking hands', 'grief')] },
  { intro: [beat(0, T.crown, 'The Council demands a public retraction', 'tense'), beat(4, T.glass, 'Cooperation on the Council’s terms', 'tense'), beat(7, T.evidence, 'The photograph cropped out its people', 'grief'), beat(10, T.evidence, 'Rei retains the implementation schedule', 'tense'), beat(13, T.relay, 'Carry the originals separately', 'urgent', 32)],
    victory: [beat(0, T.home, 'Ask how people wish to be remembered', 'warm'), beat(3, T.evidence, 'Leave copies in two places', 'tense'), beat(5, T.glass, 'The agreement exposes Ren’s betrayal', 'tense', 64), beat(8, T.blackout, 'The confession he still has not made', 'grief', 128)] },
  { intro: [beat(0, T.relay, 'The two a.m. tape is cued', 'urgent'), beat(4, T.promise, 'A promise to record side B', 'tender'), beat(5, T.evidence, 'The originals and the lost desk key', 'tense'), beat(9, T.relay, 'One recovery key and a fragile relay', 'urgent', 64), beat(11, T.rain, 'Promise to listen before the broadcast', 'tender', 128), beat(13, T.relay, 'Return together before the broadcast', 'urgent', 96)],
    victory: [beat(0, T.blackout, 'Blackout: every relay falls silent', 'grief'), beat(3, T.blackout, 'Ren admits giving away the locations', 'tense'), beat(6, T.blackout, 'The choice Aki was denied', 'grief'), beat(8, T.evidence, 'The records survived the shutdown', 'tense'), beat(9, T.blackout, 'Side B cannot be recorded tonight', 'grief', 128)] },
  { intro: [beat(0, T.blackout, 'Can a broken night be repaired', 'grief'), beat(2, T.rebuild, 'Her father’s notebook of people to thank', 'tender', 128), beat(6, T.rebuild, 'Aki finally asks for help', 'hope'), beat(8, T.prototype, 'Giving up the single recovery key', 'hope', 64), beat(11, T.evidence, 'Ren waits outside and tells the truth', 'tense'), beat(14, T.home, 'Ask for help in SORA’s name', 'hope')],
    victory: [beat(0, T.evidence, 'Ren’s public admission', 'tense', 32), beat(3, T.rebuild, 'Borrowed tools and shared responsibility', 'hope', 32), beat(4, T.prototype, 'Separate terminals, surviving records', 'hope', 96), beat(7, T.promise, 'Tomorrow’s work starts at eight', 'tender', 64), beat(9, T.jun, 'Jun plays the first note on borrowed power', 'hope')] },
  { intro: [beat(0, T.harbor, 'A rota that gets Daichi home', 'warm'), beat(3, T.evidence, 'Names checked and addresses covered', 'warm'), beat(5, T.prototype, 'A better plan in somebody else’s handwriting', 'hope', 64), beat(8, T.home, 'Learning to keep smaller promises', 'tender', 64), beat(12, T.home, 'Handing the next leg to other drivers', 'hope')],
    victory: [beat(0, T.home, 'Signed handoffs beside the toolboxes', 'hope'), beat(3, T.prototype, 'Room for people to say no', 'warm'), beat(5, T.evidence, 'The public hearing has a date', 'hope'), beat(6, T.home, 'Keep the uncomfortable correction visible', 'tender'), beat(9, T.rain, 'Coffee after the show', 'tender', 64)] },
  { intro: [beat(0, T.glass, 'The key offered before the answer', 'tense', 64), beat(2, T.crown, 'The Council decides above her', 'tense'), beat(5, T.rebuild, 'Remembering the guarded workshop key', 'tender', 128), beat(8, T.freedom, 'Aki returns the key', 'hope', 192), beat(10, T.relay, 'Spare transmitters replace the lost line', 'urgent', 64), beat(13, T.freedom, 'The last race before the public hearing', 'hope', 96)],
    victory: [beat(0, T.home, 'The hearing fills the venue', 'hope', 64), beat(1, T.evidence, 'Rei names the fuel costs she omitted', 'tense', 64), beat(3, T.jun, 'Jun stays on the stage', 'hope', 32), beat(6, T.rebuild, 'Toru remembers his father paying for fuel', 'tender', 128), beat(8, T.dawn, 'The terms before the final harbor meet', 'urgent', 32)] },
  { intro: [beat(0, T.evidence, 'Toru offers only his own purchase options', 'tense'), beat(2, T.dawn, 'The challenge spoken before everyone', 'urgent', 32), beat(6, T.crown, 'The Council’s other contracts remain', 'tense'), beat(8, T.dawn, 'Leave a line back out of the corner', 'urgent', 64), beat(11, T.promise, 'Ren leaves the microphone for the grid', 'tender', 96), beat(13, T.dawn, 'To the final grid', 'urgent', 192)],
    victory: [beat(0, T.dawn, 'Aki returns ahead of Toru', 'hope', 192), beat(2, T.evidence, 'Original documents and a kept promise', 'hope', 64), beat(3, T.freedom, 'CROWN is suspended at the harbor', 'hope', 192), beat(4, T.crown, 'The next city still faces the Council', 'tense'), beat(5, T.home, 'The next town receives the records', 'hope', 96), beat(8, T.rain, 'The harbor is quiet enough to talk', 'tender', 64)] },
  { intro: [beat(0, T.rebuild, 'Knock if you have something to repair', 'warm', 64), beat(3, T.home, 'A workshop that works when she is away', 'hope', 64), beat(7, T.jun, 'Jun finishes his abandoned song', 'hope', 64), beat(9, T.promise, 'The cassette is hers to choose', 'tender', 192), beat(12, T.home, 'Invitations from the next towns', 'hope', 192)],
    victory: [beat(0, T.home, 'A final podium and breakfast from his brother', 'warm', 192), beat(2, T.prototype, 'SORA X.O.R. outgrows the desk', 'hope', 192), beat(3, T.jun, 'Jun’s recorded premiere reaches Nikko', 'hope', 192), beat(5, T.love, 'Aki and Ren say I love you', 'tender'), beat(7, T.love, 'Their first kiss stays off the air', 'tender'), beat(9, T.love, 'Press record: the rest can wait until breakfast', 'warm')] },
];
export interface MusicArrangement {
  id: string; gains: readonly [number, number, number, number, number]; cutoff: number; width: number; pan: number;
}
export interface CutsceneMusicCue {
  key: string; chapter: number; phase: CutscenePhase; scene: StorySceneId; shot: StoryShot;
  track: number; narrative: string; mood: ScoreMood; entryBeat: number; arrangement: MusicArrangement;
}
const CAMERA_MIX: Record<StoryShot, { gains: MusicArrangement['gains']; cutoff: number; width: number; pan: number }> = {
  wide: { gains: [.9, .78, .8, .9, .75], cutoff: 6200, width: .7, pan: 0 },
  left: { gains: [.62, 1, .28, .83, .28], cutoff: 3900, width: .32, pan: -.13 },
  right: { gains: [.75, .54, .9, .72, .45], cutoff: 5000, width: .5, pan: .13 },
  detail: { gains: [.32, .34, 1.12, 1, .13], cutoff: 2900, width: .82, pan: 0 },
};
const MOOD_MIX: Record<ScoreMood, readonly [number, number, number, number, number]> = {
  warm: [1, 1, 1, 1, .8], tense: [1.15, .7, 1.1, .85, .9], tender: [.7, 1, .68, 1.16, .35],
  urgent: [1.15, .95, 1.1, .65, 1.25], grief: [.65, .7, .4, 1.1, .1], hope: [1, 1.12, 1.08, 1, 1],
};
const SCENE_COLOR: Record<StorySceneId, number> = { garage: .85, ledger: .68, radio: 1, boardroom: .73, office: .78, community: 1.12, harbor: .93, sunrise: 1.2 };
export function resolveCutsceneCue(chapter: number, phase: CutscenePhase, line: number, frame: { scene: StorySceneId; shot: StoryShot }): CutsceneMusicCue {
  const sheet = CUTSCENE_CUE_SHEETS[chapter];
  if (!sheet || !Number.isInteger(line) || line < 0) throw new RangeError('Unknown cutscene music position');
  const beats = phase === 'retry' ? [beat(0, T.rebuild, 'Take a breath and find the road home', 'tender')] : sheet[phase];
  const current = [...beats].reverse().find(value => value.from <= line)!;
  const camera = CAMERA_MIX[frame.shot], mood = MOOD_MIX[current.mood];
  return { key: `${chapter}:${phase}:${current.from}:${frame.scene}:${frame.shot}`, chapter, phase, ...frame,
    track: current.track, narrative: current.narrative, mood: current.mood, entryBeat: current.entryBeat,
    arrangement: { id: `${current.mood}:${frame.scene}:${frame.shot}`,
      gains: camera.gains.map((value, index) => value * mood[index]!) as unknown as MusicArrangement['gains'],
      cutoff: camera.cutoff * SCENE_COLOR[frame.scene], width: camera.width, pan: camera.pan } };
}
