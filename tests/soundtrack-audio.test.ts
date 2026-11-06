import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { makeScore, MUSIC_LIBRARY } from '../src/game/music-score.ts';
import suppliedRecordings from '../src/game/music-supplied-recordings.json';
import { composeStreetSong, STREET_ROUTE_SONGS } from '../src/game/street/route-songs.ts';
import qualification from './fixtures/soundtrack-export-2026-10-28/qualification.json';
import { compileAudioSource, traceSoundtrack } from './helpers/soundtrack-renderer-trace.ts';

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

test('downloadable soundtrack covers all 25 current compositions, the approved supplied recording and the street races\' songs', () => {
  assert.equal(manifest.schema, 'sora-cars-soundtrack-audio-v1');
  assert.equal(MUSIC_LIBRARY.length, 25, 'The supplied recording does not invent a synthesized score');
  assert.equal(suppliedRecordings.length, 1);
  assert.equal(manifest.tracks.length, MUSIC_LIBRARY.length + suppliedRecordings.length + STREET_ROUTE_SONGS.length);
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

test("each street race's song is a full render of its score, mastered as the race plays it and matched to the route's recording", () => {
  const tracks = manifest.tracks.filter((track: { route?: string }) => track.route);
  assert.deepEqual(tracks.map((track: { file: string }) => track.file), STREET_ROUTE_SONGS.map(song => song.file));
  STREET_ROUTE_SONGS.forEach((song, offset) => {
    const track = tracks[offset], score = composeStreetSong(song);
    assert.equal(track.route, song.route); assert.equal(track.title, song.name); assert.equal(track.japanese, song.japanese);
    assert.equal(track.bpm, score.bpm); assert.equal(track.beats, score.beats); assert.equal(track.noteCount, score.notes.length);
    assert.ok(Math.abs(track.durationSeconds - (.08 + song.seconds + 1)) <= 1 / 44100 + 1e-9, `${song.file} is the race's full song`);
    assert.equal(track.channels, 2); assert.equal(track.sampleRate, 44100); assert.equal(track.bitsPerSample, 16);
    assert.ok(Number.isFinite(track.integratedLufs)); assert.ok(track.truePeakDbtp <= -1.35);
    assert.equal(track.preview.durationSeconds, 30);
    for (const [format, suffix] of [['wav', '.wav'], ['mp3', '.mp3'], ['preview', '-preview.mp3']]) assert.equal(track[format].path, `/assets/music/audio/${song.file}${suffix}`);
    // Renders differ run to run in fine detail, so the match to the race is musical, not byte for byte.
    const race = readFileSync(path.join(root, track.routeRecording.path));
    assert.equal(createHash('sha256').update(race).digest('hex'), track.routeRecording.sha256, `${song.route}'s recording is the one compared`);
    assert.ok(track.routeRecording.differenceDb < -20, `${song.file} is the race's song`);
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

test('the 25 released score renders keep their exact export records and all 75 recorded file hashes', () => {
  // SHA-256 of the October 28 export's exact {sourceHashes, tracks} JSON (the
  // rewritten score and synthesizer). Actual file-byte checks below make this a
  // byte preservation check, without depending on an ignored local output directory.
  const previous = { sourceHashes: manifest.sourceHashes, tracks: manifest.tracks.slice(0, MUSIC_LIBRARY.length) };
  assert.equal(createHash('sha256').update(JSON.stringify(previous)).digest('hex'), 'bfd0660749b2a0d47f4da526cbbf192e9412b94556f2f3b14fe4280b94109ef2');
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

const exportSources = ['src/game/audio.ts', 'src/game/music-synth.ts', 'src/game/music-composer.ts', 'src/game/music-score.ts', 'src/game/music-themes.ts', 'src/game/music-cues.ts', 'scripts/export-soundtrack.mjs'];
const sourceText = (source: string) => readFileSync(path.join(root, source), 'utf8');
const sha256 = (source: string) => createHash('sha256').update(source).digest('hex');

function verifyQualifiedSources(read = sourceText): void {
  assert.deepEqual(Object.keys(manifest.sourceHashes).sort(), [...exportSources].sort(), 'the original export source inventory stays closed');
  assert.equal(qualification.schema, 'sora-cars-soundtrack-source-qualification-v1');
  assert.equal(qualification.historicalAudio.sha256, manifest.sourceHashes['src/game/audio.ts']);
  assert.equal(sha256(read(qualification.historicalAudio.file)), manifest.sourceHashes['src/game/audio.ts'], 'historical renderer fixture is the exact exported source');
  assert.equal(qualification.historicalCues.sha256, manifest.sourceHashes['src/game/music-cues.ts']);
  assert.deepEqual(Object.keys(qualification.reviewedCurrentSources).sort(), ['src/game/audio.ts', 'src/game/music-cues.ts', 'src/game/story-place-themes.ts']);
  for (const [source, expected] of Object.entries(qualification.reviewedCurrentSources)) {
    assert.equal(sha256(read(source)), expected, `${source} changed: independently review renderer compatibility before changing this qualification`);
  }
  for (const source of exportSources.filter(source => !Object.hasOwn(qualification.reviewedCurrentSources, source))) {
    assert.equal(sha256(read(source)), manifest.sourceHashes[source], `${source} changed: qualify and export the changed soundtrack before shipping it`);
  }
}

test('historic export provenance and exact qualified current renderer sources are independently pinned', () => {
  verifyQualifiedSources();
});

test('source qualification rejects renderer, synthesis, cue, import dependency and historical fixture drift', () => {
  for (const source of [...exportSources, 'src/game/story-place-themes.ts', qualification.historicalAudio.file]) {
    assert.throws(() => verifyQualifiedSources(file => sourceText(file) + (file === source ? '\n// unreviewed change\n' : '')),
      { name: 'AssertionError' }, source);
  }
});

test('current renderer preserves every complete released score and its synthesizer schedule', () => {
  verifyQualifiedSources();
  const historical = compileAudioSource(sourceText(qualification.historicalAudio.file));
  const current = compileAudioSource(sourceText('src/game/audio.ts'));
  MUSIC_LIBRARY.forEach((song, index) => {
    assert.deepEqual(traceSoundtrack(current, index), traceSoundtrack(historical, index), `${song.file}: complete Web Audio schedule matches the manifest-pinned renderer`);
  });
});

test('renderer comparison detects actual mix, timing and voice-duration changes', () => {
  const source = sourceText('src/game/audio.ts'), baseline = traceSoundtrack(compileAudioSource(source), 0);
  for (const [before, after] of [['headroom.gain.value = .3;', 'headroom.gain.value = .31;'],
    ['lead: .08', 'lead: .09'], ['note.duration * beat,', 'note.duration * beat * 1.01,']]) {
    assert.ok(source.includes(before!));
    const changed = traceSoundtrack(compileAudioSource(source.replace(before!, after!)), 0);
    assert.notEqual(changed.sha256, baseline.sha256, `detect ${before}`);
  }
});
