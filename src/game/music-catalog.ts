import { MUSIC_LIBRARY } from './music-score';
import generated from './music-assets.generated.json';
import suppliedRecordings from './music-supplied-recordings.json';

export interface MusicFile { path: string; bytes: number; sha256: string; }
export type MusicProvenance = { kind: 'game-synthesizer-score' } | {
  kind: 'supplied-lossy-recording'; source: typeof suppliedRecordings[number]['source']; note: string;
};
export interface MusicAssets { wav: MusicFile; mp3: MusicFile; preview: MusicFile; cover: MusicFile; durationSeconds: number; provenance?: MusicProvenance; }
export interface MusicItem {
  sku: string; kind: 'music'; track: number; file: string; name: { ja: string; en: string }; artist: string;
  description: { ja: string; en: string }; bpm: number | null; durationSeconds: number;
  collection: 'Roadside A' | 'After Hours B' | 'Side B Stories' | 'Tokyo Routes'; provenance: MusicProvenance;
  assets?: MusicAssets; license: { id: string; path: string; sha256: string };
}
export const MUSIC_PRICE_XOR = '1';
export const MUSIC_LICENSE = Object.freeze({ id: 'sora-music-unlimited-v1', path: 'assets/music/sora-music-license-v1.txt', sha256: 'f492695f1c9ce7fe4534400dd047af97aa14d587410d152b5249f9efedd20b57' });
const descriptions = [
 ['夜の峠を走る、鋭いベースとトランジスタの光。', 'A night-road pulse of sharp bass and transistor light.'],
 ['港の灯が、跳ねるベースと交信する。', 'Harbor lights answer a syncopated bass line.'],
 ['桜のトンネルを抜ける、疾走する電子音。', 'Fast sequencers through a tunnel of spring blossoms.'],
 ['シャッターの向こう、帰りを待つ温かい和音。', 'Warm chords behind a shutter left open for you.'],
 ['書類の街に浮かぶ、冷たい輪郭のメロディー。', 'A cool-edged melody above a city made of paper.'],
 ['小さな回路から始まる、明日への合奏。', 'A bright ensemble building tomorrow one circuit at a time.'],
 ['終電が去ったホームに残る、やわらかな余韻。', 'Soft echoes on the platform after the last train.'],
 ['数字の向こうの暮らしを刻む、切迫したビート。', 'An urgent beat for the lives behind the numbers.'],
 ['夜明けの空へ、アナログの電波を送る。', 'An analog transmission into the first light.'],
 ['空白のカセットに、まだ言えない約束を。', 'A blank cassette holds a promise still unspoken.'],
 ['返済期限の紙をめくる、静かな緊張。', 'Quiet tension as the repayment deadline draws closer.'],
 ['街を起こす配達車と、眠らないリズム。', 'Delivery vans wake the city to a sleepless rhythm.'],
 ['複写紙の署名が語る、ためらいと決意。', 'Hesitation and resolve in a carbon-copy signature.'],
 ['冷たい王冠が、整然とした回路を見下ろす。', 'A cold crown above a precisely ordered circuit.'],
 ['パンと修理、初めて届いた交換の記録。', 'Bread, repairs, and the first exchanged receipt.'],
 ['雨の向こうで、ふたつの椅子が近づく。', 'Two chairs move closer while the rain keeps falling.'],
 ['ガラス越しの申し出。美しく、危うい静けさ。', 'An offer behind glass: beautiful, uneasy stillness.'],
 ['午前二時へ向かう、電波と鼓動のリレー。', 'Radio pulses and heartbeats race toward two a.m.'],
 ['放送が途切れ、隠していた言葉だけが残る。', 'The broadcast falls silent; the hidden words remain.'],
 ['借りた電気で灯る、もう一度の最初の音。', 'Borrowed power lights the first note of a new beginning.'],
 ['帰り道はひとつじゃない。誰かにつなぐ周波数。', 'More than one road home, carried from hand to hand.'],
 ['ひとりの鍵を返して、街へ開くメロディー。', 'A melody opens to the city as one key is returned.'],
 ['夜明けの港へ、最後のコーナーを抜ける。', 'Through the final corner toward a harbor dawn.'],
 ['ジュンが最後まで弾いた、長く待たせた一曲。', 'The song Jun finally played all the way through.'],
 ['録音ボタンを押して、ふたりの朝を始めよう。', 'Press record, and let a morning together begin.'],
] as const;
const assets = generated as Record<string, MusicAssets>;
export const MUSIC_ARTIST = 'SORA Cars';
export const MUSIC_ITEMS: readonly MusicItem[] = [...MUSIC_LIBRARY.map((song, track): MusicItem => ({
  sku: `music-${song.file}`, kind: 'music', track, file: song.file,
  name: { ja: song.japanese, en: song.name }, artist: MUSIC_ARTIST, description: { ja: descriptions[track]![0], en: descriptions[track]![1] },
  bpm: song.bpm, durationSeconds: assets[song.file]?.durationSeconds ?? 256 * 60 / song.bpm + 2,
  collection: track < 3 ? 'Roadside A' : track < 9 ? 'After Hours B' : 'Side B Stories',
  assets: assets[song.file], license: MUSIC_LICENSE, provenance: { kind: 'game-synthesizer-score' },
})), ...suppliedRecordings.map((song, index): MusicItem => ({
  sku: `music-${song.file}`, kind: 'music', track: MUSIC_LIBRARY.length + index, file: song.file,
  name: { ja: song.japanese, en: song.name }, artist: song.artist, description: song.description,
  bpm: song.bpm, durationSeconds: assets[song.file]?.durationSeconds ?? song.source.durationSeconds,
  collection: 'Tokyo Routes', assets: assets[song.file], license: MUSIC_LICENSE,
  provenance: { kind: 'supplied-lossy-recording', source: song.source, note: 'User-supplied AAC recording. WAV is a decoded and resampled distribution copy of a lossy source, not an original lossless master. MP3 and preview are derived from that copy; no new composition or synthesized score is claimed.' },
}))];
export const musicItem = (sku: string | null | undefined): MusicItem | undefined => MUSIC_ITEMS.find(item => item.sku === sku);
export function musicItemMetadata(item: MusicItem, applicationId: string, licensor: string) {
  if (typeof licensor !== 'string' || !licensor.trim() || licensor.length > 240 || /[\u0000-\u001f\u007f]/.test(licensor)) throw new Error('A named music licensor is required.');
  const validFile = (file: MusicFile | undefined, path: string) => !!file && file.path === path && /^[a-f0-9]{64}$/.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 64_000_000;
  if (!item.assets || !validFile(item.assets.wav, `assets/music/audio/${item.file}.wav`)
    || !validFile(item.assets.mp3, `assets/music/audio/${item.file}.mp3`)
    || !validFile(item.assets.preview, `assets/music/audio/${item.file}-preview.mp3`)
    || !validFile(item.assets.cover, `assets/music/covers/${item.file}-v1.png`)
    || !Number.isFinite(item.durationSeconds) || item.durationSeconds < 30 || item.durationSeconds > 600
    || item.assets.durationSeconds !== item.durationSeconds
    || item.artist !== MUSIC_ARTIST
    || item.provenance.kind === 'supplied-lossy-recording' && JSON.stringify(item.assets.provenance) !== JSON.stringify(item.provenance)
    || item.license.id !== MUSIC_LICENSE.id || item.license.path !== MUSIC_LICENSE.path || item.license.sha256 !== MUSIC_LICENSE.sha256)
    throw new Error('Music release needs complete, hash-pinned local assets and license.');
  return {
    sora_cars: { version: 1, application_id: applicationId, sku: item.sku, kind: item.kind },
    name: item.name.ja, subtitle: item.name.en, artist: item.artist, description: item.description.ja, description_en: item.description.en,
    collection: 'SORA RECORDS · Original Soundtrack', edition_policy: 'Multiple non-exclusive licensed editions; no fixed scarcity claim.',
    price_xor: MUSIC_PRICE_XOR, bpm: item.bpm, duration_seconds: item.durationSeconds,
    recording: { wav: item.assets.wav, mp3: item.assets.mp3, preview: item.assets.preview, provenance: item.provenance }, artwork: item.assets.cover,
    license: { ...item.license, licensor: licensor.trim(), grant: 'Worldwide, perpetual, non-exclusive, irrevocable, royalty-free personal and commercial use; unlimited projects, copies and revenue; survives NFT transfer.' },
  };
}
