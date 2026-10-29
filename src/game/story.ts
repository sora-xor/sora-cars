import { CAMPAIGN } from './story-campaign';
import type { StorySceneId, StoryShot, StoryBeatArt } from './story-scenes';
export interface Bilingual { ja: string; en: string }
export interface Character { id: string; name: Bilingual; role: Bilingual; dream: Bilingual; color: string; number: string }
export interface Dialogue extends Bilingual { speaker: string; scene?: StorySceneId; shot?: StoryShot; art?: StoryBeatArt; setting?: Bilingual }
/** `id` is the chapter's stable identity (its art, music and dossier); its index in
 * `CHAPTERS` is its place in play order. A chapter races an Arcade circuit (`trackId`)
 * or a 1986 street route (`route`). */
export interface StoryChapter { id: number; act: number; synopsis: Bilingual; dossier: Bilingual; title: Bilingual; place: Bilingual; trackId?: number; route?: string; art: string; intro: readonly Dialogue[]; victory: readonly Dialogue[] }
export const CREW: readonly Character[] = [
  { id: 'aki', name: { ja: '空本（そらもと）アキ', en: 'Aki Soramoto' }, role: { ja: '24歳・整備士', en: '24 · Mechanic' }, dream: { ja: '二年前に父を亡くし、工房の鍵と借金を引き継いだ。エンジンの異音には気づくのに、「手伝おうか」には強がってしまう。守りたい場所と、そばにいてほしい人。その両方を言葉にできずにいる。', en: 'Two years after her father’s death, Aki holds the garage keys and its debts. She hears every engine fault, but struggles to hear an offer of help. There is a place she wants to save, and someone she wants beside her. Neither is easy to say.' }, color: '#ef4d45', number: '01' },
  { id: 'ren', name: { ja: '空井（そらい）レン', en: 'Ren Sorai' }, role: { ja: '23歳・夜間ラジオDJ', en: '23 · Late-night radio DJ' }, dream: { ja: 'レコード屋の閉店後、小さなSORA放送室から夜へ声を送る。冗談は得意、本音の前には針が飛ぶ。誰にも必要とされなくなるのが怖い。アキに渡すカセットのB面には、まだ何も録音できない。', en: 'After the record shop closes, Ren broadcasts from a tiny SORA booth. Quick with a joke, he skips like a scratched record when things get personal. He fears being unwanted. The B-side of the cassette he brings Aki is still blank.' }, color: '#e9dbc8', number: '02' },
  { id: 'mei', name: { ja: '天羽（あまは）メイ', en: 'Mei Amaha' }, role: { ja: '26歳・写真家', en: '26 · Photographer' }, dream: { ja: 'かつて立ち退きの写真を、華やかな再開発の記事に売った。今はシャッターを切る前に、写る人の話を聞く。憧れた雑誌の署名欄と、目の前の人への責任。フィルムには、その迷いも残る。', en: 'Mei once sold an eviction photograph for a glamorous redevelopment story. Now she listens before pressing the shutter. The magazine byline she dreamed of pulls one way; responsibility to the people in her frame pulls another.' }, color: '#749ee0', number: '03' },
  { id: 'daichi', name: { ja: '雲野（くもの）ダイチ', en: 'Daichi Kumono' }, role: { ja: '25歳・港の配達員', en: '25 · Harbor courier' }, dream: { ja: '弟を養い、横浜の夜を荷物と走る。「僕が行く」が口ぐせだが、危ない配達をいつまでも続けたくはない。直しかけの車で弟に運転を教えたい。港の仲間にも、無事に帰れる毎日があってほしい。', en: 'Daichi runs harbor deliveries to support his younger brother. “I’ll go” comes too easily, and he wants a life beyond dangerous night work. An unfinished car waits for his brother’s first driving lesson. He wants every courier to have a way home.' }, color: '#68cfbc', number: '04' },
  { id: 'yui', name: { ja: '空木（うつぎ）ユイ', en: 'Yui Utsugi' }, role: { ja: '27歳・設計技師', en: '27 · Design engineer' }, dream: { ja: '太陽で動く工房と、誰もが使えるSORA X.O.R.端末を設計する。美しい回路ほど、自分の手で守りたくなる。他人の赤ペンが入った設計図を、まだ素直には受け取れない。', en: 'Yui designs a solar-powered workshop and SORA X.O.R. terminals anyone could use. The more elegant the circuit, the harder she finds it to let go. A blueprint marked in someone else’s red pen may be her toughest engineering problem.' }, color: '#f4ca55', number: '05' },
  { id: 'jun', name: { ja: '天野（あまの）ジュン', en: 'Jun Amano' }, role: { ja: '28歳・電子楽器修理職人', en: '28 · Synthesizer repairer' }, dream: { ja: '人の楽器は直せるのに、昔やめたバンドの曲だけは未完成。アキの父の修理ノートを預かり、はんだごてを片手に仲間の相談を聞く。いつかSORAの夜明けに、自分の音で返事をしたい。', en: 'Jun can repair anyone’s synthesizer, but cannot finish the song from the band he left. He keeps Aki’s father’s repair notes and listens with a soldering iron in hand. One dawn at SORA Garage, he hopes to answer in his own music.' }, color: '#b697e6', number: '06' },
];
export const RIVALS: readonly Character[] = [
  { id: 'rei', name: { ja: '空城（そらしろ）レイ', en: 'Rei Sorashiro' }, role: { ja: '29歳・融資調査員', en: '29 · Credit analyst' }, dream: { ja: '港の商店街で育ち、人を助けたくて数字の仕事を選んだ。クラウン計画の初期評価書には、彼女自身の署名がある。手帳を閉じれば、今の生活は守れる。それでも、窓口に来た人の顔を忘れられない。', en: 'Raised by the harbor, Rei wanted numbers to help people. An early CROWN assessment carries her own signature. Closing her notebook would protect her comfortable life. The faces across her desk make that harder every day.' }, color: '#b8c6dd', number: '07' },
  { id: 'toru', name: { ja: '天宮（あまみや）トオル', en: 'Toru Amamiya' }, role: { ja: '34歳・開発会社代表／ドライバー', en: '34 · Developer / Driver' }, dream: { ja: '資金を断たれて閉じた父の工場。その記憶から、誰にも奪われない力を求めた。メリディアン評議会と組み、街にもコーナーにも完璧な線を引く。その線の外で暮らす人の声は、まだ届かない。', en: 'Toru remembers his father’s factory closing when credit vanished. He sought power nobody could take away. Now allied with the Meridian Council, he draws a perfect line through both cities and corners. He rarely hears the people living outside it.' }, color: '#d79b93', number: '08' },
  { id: 'celeste', name: { ja: 'セレステ・ヴェイル', en: 'Celeste Vale' }, role: { ja: '32歳・国際投資部門の交渉役', en: '32 · International investment negotiator' }, dream: { ja: 'メリディアン評議会の交渉役。クラウン計画が壊す暮らしを知ったうえで、世界の取引を一つの許可の下に置こうとする。声を荒らげず、相手が最も欲しいものを差し出す。彼女にとって、自由にも買値がある。', en: 'The Meridian Council’s negotiator knows which lives CROWN will break. She wants the world’s exchanges to require a single permission. Never raising her voice, she offers precisely what her opponent longs for. To Celeste, even freedom has a purchase price.' }, color: '#ddc292', number: '09' },
];
export const STORY_CAST: readonly Character[] = [...CREW, ...RIVALS];
export const CHAPTERS: readonly StoryChapter[] = CAMPAIGN;
/** Where the chapter with stable `id` falls in play order. */
export function chapterPosition(id: number): number {
  const index = CHAPTERS.findIndex(chapter => chapter.id === id);
  if (index < 0) throw new RangeError('Unknown chapter');
  return index;
}
/** The Arcade grid at a point in play order: Rei races once she has brought the assessment (ID 2), Toru once he has made his offer (ID 3). */
export function storyGrid(chapter: number): string[] {
  return [...CREW.slice(1).map(c => c.name.ja), chapter >= chapterPosition(2) ? RIVALS[0]!.name.ja : '港のドライバー', 'YOU', chapter >= chapterPosition(3) ? RIVALS[1]!.name.ja : 'SORAゲスト'];
}
/** The two drivers beside the crew at each street-race chapter's host club. */
const STREET_GUESTS: Readonly<Record<number, readonly [string, string]>> = {
  12: ['日光クラブ', '明智平の常連'], 13: [RIVALS[0]!.name.ja, '夜明け会のタクシー'], 14: ['会津クラブ', '七日町の漆職人'],
  15: [RIVALS[0]!.name.ja, '京都クラブ'], 16: [RIVALS[0]!.name.ja, '奈良の走り屋'],
};
/** The eight street-race names, the player first; the street engine's slot 0 is Aki. */
export function storyStreetGrid(chapter: number): string[] {
  const id = CHAPTERS[chapter]?.id ?? -1, guests = STREET_GUESTS[id] ?? ['SORAゲスト', 'SORAゲスト'];
  const plain = (name: string) => name.replace(/（.*?）/, '');
  return [`YOU · ${plain(CREW[0]!.name.ja)}`, ...CREW.slice(1).map(c => plain(c.name.ja)), ...guests.map(plain)];
}
/** Only the harbor showdown (ID 10) asks for more than a podium. */
const isShowdown = (chapter: number) => CHAPTERS[chapter]?.id === 10;
/** The goal `storyObjectiveMet` checks, as the story menu and pre-race garage state it. */
export function storyObjective(chapter: number): Bilingual {
  return isShowdown(chapter) ? { ja: '3位以内 ＋ 天宮より先着', en: 'PODIUM + BEAT AMAMIYA' } : { ja: '3位以内', en: 'FINISH ON THE PODIUM' };
}
export function storyObjectiveMet(chapter: number, place: number, rivalPlace?: number): boolean {
  return Number.isInteger(place) && place >= 1 && place <= 3
    && (!isShowdown(chapter) || (Number.isInteger(rivalPlace) && rivalPlace! >= 1 && rivalPlace! <= 8 && place < rivalPlace!));
}
export const RETRY_SCENE: readonly Dialogue[] = [
  { speaker: 'daichi', ja: '戻ってきたな。肩の力、抜いていいよ。次の一本は、コーナーの手前で呼吸を整えよう。', en: 'You made it back. Let your shoulders drop. Next run, take a breath before the corner.' },
  { speaker: 'jun', ja: 'ノートを開こう。遅く入って、出口で踏む。ドリフトも、向きを変えたい場所で使えばいい。', en: 'Open the notebook. Enter slower; accelerate out. Save the drift for where you need to turn.' },
  { speaker: 'aki', ja: 'うん。タイムだけ見て、道を見失ってた。次は、ちゃんと帰ってこられる走りにする。', en: 'Right. I watched the clock and lost the road. Next time, I’ll drive like I have somewhere to come home to.' },
];
/** A save from the twelve-chapter campaign resumes at its next chapter's place in play order;
 * the street-race chapters woven in before it stay open to play. */
export function migrateStoryProgress(legacy: number): number {
  const saved = Math.min(12, Math.max(0, Number.isInteger(legacy) ? legacy : 0));
  return saved >= 12 ? CHAPTERS.length : chapterPosition(saved);
}
export function storyProgress(value: unknown): number { return typeof value === 'number' && Number.isInteger(value) ? Math.min(CHAPTERS.length, Math.max(0, value)) : 0; }
export function completeStoryChapter(progress: number, chapter: number, place: number, rivalPlace?: number): number {
  if (!Number.isInteger(chapter) || chapter < 0 || chapter >= CHAPTERS.length || chapter > storyProgress(progress) || !Number.isInteger(place) || place < 1 || place > 8) return storyProgress(progress);
  return storyObjectiveMet(chapter, place, rivalPlace) ? Math.max(storyProgress(progress), chapter + 1) : storyProgress(progress);
}
