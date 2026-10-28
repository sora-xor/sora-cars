import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { makeScore, MUSIC_LIBRARY } from '../src/game/music-score.ts';
import suppliedRecordings from '../src/game/music-supplied-recordings.json';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/assets/music/audio/manifest.json'), 'utf8'));
type AudioFile = { path: string; bytes: number; sha256: string };

function wavData(file: string) {
  const fd = openSync(file, 'r'), header = Buffer.alloc(8192);
  try { readSync(fd, header, 0, header.length, 0); } finally { closeSync(fd); }
  assert.equal(header.toString('ascii', 0, 4), 'RIFF'); assert.equal(header.toString('ascii', 8, 12), 'WAVE');
  let formatChecked = false;
  for (let offset = 12; offset + 8 < header.length;) {
    const id = header.toString('ascii', offset, offset + 4), size = header.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      assert.equal(header.readUInt16LE(offset + 8), 1, 'WAV contains linear PCM');
      assert.equal(header.readUInt16LE(offset + 10), 2); assert.equal(header.readUInt32LE(offset + 12), 44100);
      assert.equal(header.readUInt16LE(offset + 22), 16); formatChecked = true;
    }
    if (id === 'data') { assert.ok(formatChecked); return { start: offset + 8, end: offset + 7 + size, frames: size / 4 }; }
    offset += 8 + size + size % 2;
  }
  throw new Error(`WAV data chunk missing from ${file}`);
}

test('downloadable soundtrack covers all 25 current compositions and the approved supplied recording', () => {
  assert.equal(manifest.schema, 'sora-cars-soundtrack-audio-v1');
  assert.equal(MUSIC_LIBRARY.length, 25, 'The supplied recording does not invent a synthesized score');
  assert.equal(suppliedRecordings.length, 1);
  assert.equal(manifest.tracks.length, MUSIC_LIBRARY.length + suppliedRecordings.length);
  assert.equal(new Set(manifest.tracks.map((track: { file: string }) => track.file)).size, manifest.tracks.length);
  MUSIC_LIBRARY.forEach((song, index) => {
    const track = manifest.tracks[index], score = makeScore(index);
    assert.equal(track.index, index); assert.equal(track.file, song.file); assert.equal(track.title, song.name);
    assert.equal(track.japanese, song.japanese); assert.equal(track.bpm, score.bpm);
    assert.equal(track.bars, 64); assert.equal(track.beats, score.beats); assert.equal(track.noteCount, score.notes.length);
    assert.ok(Math.abs(track.durationSeconds - (.08 + score.beats * 60 / score.bpm + 1)) <= 1 / 44100 + 1e-9);
    assert.equal(track.channels, 2); assert.equal(track.sampleRate, 44100); assert.equal(track.bitsPerSample, 16);
    assert.ok(track.peak > .1 && track.peak < 1); assert.ok(track.rms > .02);
    assert.ok(Number.isFinite(track.integratedLufs)); assert.ok(track.truePeakDbtp <= -1.35);
    assert.equal(track.preview.durationSeconds, 30);
    assert.ok(track.durationSeconds > track.preview.durationSeconds * 3, 'a complete song is supplied separately from its preview');
    assert.equal(track.wav.path, `/assets/music/audio/${song.file}.wav`);
    assert.equal(track.mp3.path, `/assets/music/audio/${song.file}.mp3`);
    assert.equal(track.preview.path, `/assets/music/audio/${song.file}-preview.mp3`);
  });
});

test('the supplied Tokyo recording retains its honest source provenance and complete duration', () => {
  const song = suppliedRecordings[0]!;
  assert.equal(song.file, 'meet-me-at-yasukuni');
  assert.equal(song.source.sha256, '85401fb75fd6f1f409119dd0ea47642cb9ea173bbb2f06d7a14506febcaf84a6');
  assert.equal(song.source.codec, 'aac'); assert.equal(song.source.lossy, true);
  assert.equal(song.source.sampleRate, 48000); assert.equal(song.source.channels, 2);
  const track = manifest.tracks.find((entry: { file: string }) => entry.file === song.file);
  assert.ok(track);
  assert.equal(track.index, MUSIC_LIBRARY.length); assert.equal(track.title, song.name);
  assert.equal(track.japanese, song.japanese); assert.equal(track.artist, 'SORA Cars');
  assert.equal(track.bpm, null, 'No unmeasured tempo is attributed to supplied audio');
  for (const field of ['bars', 'beats', 'noteCount', 'scoreSeconds']) assert.equal(field in track, false, `${field} cannot claim a synthesized arrangement`);
  assert.equal(track.provenance.kind, 'supplied-lossy-recording');
  assert.deepEqual(track.provenance.source, song.source);
  assert.match(track.provenance.note, /lossy source, not an original lossless master/);
  for (const source of [song.source.path, path.join('public', song.source.publishedPath)]) {
    const bytes = readFileSync(path.join(root, source));
    assert.equal(bytes.length, song.source.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), song.source.sha256, `${source} must be the approved supplied recording`);
  }
  assert.ok(Math.abs(track.durationSeconds - song.source.durationSeconds) < 1 / 44100);
  assert.equal(track.sampleRate, 44100); assert.equal(track.channels, 2); assert.equal(track.bitsPerSample, 16);
  assert.ok(track.peak > .1 && track.peak < 1); assert.ok(track.rms > .02);
  assert.ok(Number.isFinite(track.integratedLufs)); assert.ok(track.truePeakDbtp <= -1.35);
  assert.equal(track.preview.durationSeconds, 30); assert.equal(track.preview.startSeconds, song.previewStartSeconds);
  for (const [format, suffix] of [['wav', '.wav'], ['mp3', '.mp3'], ['preview', '-preview.mp3']]) {
    assert.equal(track[format!].path, `/assets/music/audio/${song.file}${suffix}`);
  }
});

test('adding the supplied song preserves the original 25 export records and all 75 recorded file hashes', () => {
  // SHA-256 of the retained September 22 report's exact {sourceHashes, tracks}
  // JSON. Actual file-byte checks below make this a byte preservation check,
  // without depending on an ignored local output directory at test time.
  const previous = { sourceHashes: manifest.sourceHashes, tracks: manifest.tracks.slice(0, MUSIC_LIBRARY.length) };
  assert.equal(createHash('sha256').update(JSON.stringify(previous)).digest('hex'), '0a015b89bda2af4056db3e9f18dc2605f64cdbcced6c34bf778d83e8c84f4b65');
});

test('every downloadable and preview byte matches its published content hash', async () => {
  const completeHashes = new Set<string>();
  for (const track of manifest.tracks) {
    for (const format of ['wav', 'mp3', 'preview']) {
      const file = track[format] as AudioFile;
      const local = path.join(root, 'public', file.path);
      assert.equal(statSync(local).size, file.bytes);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(local)) hash.update(chunk);
      assert.equal(hash.digest('hex'), file.sha256, `${track.file} ${format} content integrity`);
    }
    // RIFF title tags differ even if audio were accidentally duplicated. Hash
    // the PCM chunk itself so catalog uniqueness checks the actual recording.
    const wav = path.join(root, 'public', track.wav.path), data = wavData(wav);
    assert.ok(Math.abs(data.frames / 44100 - track.durationSeconds) < 1 / 44100);
    const pcm = createHash('sha256');
    for await (const chunk of createReadStream(wav, { start: data.start, end: data.end })) pcm.update(chunk);
    completeHashes.add(pcm.digest('hex'));
  }
  assert.equal(completeHashes.size, manifest.tracks.length, 'no track reuses another recording');
});

test('supplied-recording conversion pins its separate source definition and exporter', () => {
  for (const source of ['src/game/music-supplied-recordings.json', 'scripts/export-supplied-soundtrack.mjs']) {
    assert.equal(createHash('sha256').update(readFileSync(path.join(root, source))).digest('hex'), manifest.suppliedSourceHashes[source], `${source} changed: validate and export the supplied recording before shipping it`);
  }
});

test('audio manifest pins the score, synthesizer and reproducible export sources', () => {
  for (const source of ['src/game/audio.ts', 'src/game/music-score.ts', 'src/game/music-themes.ts', 'src/game/music-cues.ts', 'scripts/export-soundtrack.mjs']) {
    assert.equal(createHash('sha256').update(readFileSync(path.join(root, source))).digest('hex'), manifest.sourceHashes[source], `${source} changed: rebuild soundtrack before shipping it`);
  }
});
