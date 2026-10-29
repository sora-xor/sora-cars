import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/game/audio';
import { CHAPTERS, RETRY_SCENE } from '../src/game/story';
import { resolveStoryShot } from '../src/game/story-scenes';
import { CUTSCENE_CUE_SHEETS, resolveCutsceneCue } from '../src/game/music-cues';
import { MUSIC_LIBRARY, makeScore } from '../src/game/music-score';
import { STORY_THEMES } from '../src/game/music-themes';

test('sixteen new compositions have distinct written melodic, harmonic and rhythmic identities', () => {
  assert.equal(MUSIC_LIBRARY.length, 25);
  assert.equal(STORY_THEMES.length, 16);
  for (const key of ['hookA', 'hookB', 'verse', 'chorus'] as const) {
    assert.equal(new Set(STORY_THEMES.map(theme => JSON.stringify(theme[key]))).size, 16, `all ${key} parts are individually composed`);
  }
  const melodicFingerprints = new Set<string>();
  for (let index = 9; index < MUSIC_LIBRARY.length; index++) {
    const score = makeScore(index), root = MUSIC_LIBRARY[index]!.root;
    // The lead enters with the first full statement at beat 32.
    melodicFingerprints.add(JSON.stringify(score.notes.filter(note => note.channel === 1 && note.beat >= 32 && note.beat < 48).map(note => [note.beat, note.duration, note.pitch - root])));
    assert.equal(score.patches?.length, 4);
    assert.ok(score.notes.every(note => Number.isFinite(note.pitch) && note.pitch >= 0 && note.pitch <= 127 && note.duration > 0 && note.beat + note.duration <= score.beats));
  }
  assert.equal(melodicFingerprints.size, 16, 'the playable themes are not transpositions of each other');
});

test('all 24 screenplay sequences have deliberate cues and every camera cut changes arrangement', () => {
  assert.equal(CUTSCENE_CUE_SHEETS.length, CHAPTERS.length);
  const used = new Set<number>();
  for (const chapter of CHAPTERS) for (const phase of ['intro', 'victory'] as const) {
    const sheet = CUTSCENE_CUE_SHEETS[chapter.id]![phase], lines = chapter[phase];
    assert.equal(sheet[0]!.from, 0); assert.ok(sheet.length >= 3);
    sheet.forEach((beat, index) => {
      assert.ok(beat.from >= 0 && beat.from < lines.length, `${chapter.id} ${phase} beat exists in the script`);
      if (index) assert.ok(beat.from > sheet[index - 1]!.from);
      assert.ok(['fade', 'cut', 'slow', 'powerdown'].includes(beat.transition));
      if (beat.track === null) { assert.equal(beat.entryBeat, 0, 'a silence has no entrance'); return; }
      assert.ok(MUSIC_LIBRARY[beat.track]); used.add(beat.track);
      assert.ok(Number.isInteger(beat.entryBeat) && beat.entryBeat >= 0 && beat.entryBeat < makeScore(beat.track).beats, 'authored entrances remain inside the score');
    });
    lines.forEach((_, index) => {
      const shot = resolveStoryShot(lines, index), cue = resolveCutsceneCue(chapter.id, phase, index, shot);
      assert.ok(cue.narrative.length > 10); assert.ok(cue.arrangement.gains.every(Number.isFinite));
      if (!index) return;
      const previousShot = resolveStoryShot(lines, index - 1), previous = resolveCutsceneCue(chapter.id, phase, index - 1, previousShot);
      if (previousShot.shot !== shot.shot || previousShot.scene !== shot.scene) assert.notEqual(cue.arrangement.id, previous.arrangement.id, `${chapter.id} ${phase} line ${index} follows camera direction`);
      if (previousShot.shot === shot.shot && previousShot.scene === shot.scene && !sheet.some(beat => beat.from === index)) assert.deepEqual(cue, previous, 'held lines do not restart music');
    });
  }
  assert.deepEqual([...used].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 9));
});

test('returning themes enter developed phrases while Jun’s song grows from first note to premiere', () => {
  const cue = (chapter: number, phase: 'intro' | 'victory', line: number) => resolveCutsceneCue(chapter, phase, line, resolveStoryShot(CHAPTERS[chapter]![phase], line));
  assert.equal(cue(7, 'victory', 9).entryBeat, 0, 'Jun first plays the opening on borrowed power');
  assert.equal(cue(9, 'victory', 3).entryBeat, 32, 'the public hearing gets his full statement');
  assert.equal(cue(11, 'intro', 7).entryBeat, 64, 'the finished song introduces its answering phrase');
  assert.equal(cue(11, 'victory', 3).entryBeat, 192, 'the premiere opens with the completed, lifted answer');
  assert.equal(cue(9, 'intro', 8).entryBeat, 192, 'returning the key earns the developed freedom theme');
  const audio = new GameAudio(), premiere = cue(11, 'victory', 3);
  audio.setCutsceneCue(premiere); const first = audio.musicState;
  assert.equal(first.entryBeat, 192); assert.equal(first.requestedEntryBeat, 192); assert.equal(first.transportBeat, 192);
  audio.setCutsceneCue(premiere); assert.deepEqual(audio.musicState, first);
  audio.setCutsceneCue(cue(11, 'victory', 4));
  assert.equal(audio.musicState.startedAt, first.startedAt); assert.equal(audio.musicState.transitions, first.transitions);
  assert.equal(audio.musicState.entryBeat, 192); assert.equal(audio.musicState.transportBeat, 192);
  audio.setCutsceneCue({ ...premiere, key: 'same-song-new-request', entryBeat: 64 });
  assert.equal(audio.musicState.requestedEntryBeat, 64, 'diagnostics distinguish the new cue request');
  assert.equal(audio.musicState.entryBeat, 192, 'a same-song narrative change keeps its actual entrance');
  assert.equal(audio.musicState.startedAt, first.startedAt); assert.equal(audio.musicState.transitions, first.transitions);
  for (const entryBeat of [-1, 256, Infinity, NaN]) {
    const before = audio.musicState;
    assert.throws(() => audio.setCutsceneCue({ ...premiere, key: `invalid-${entryBeat}`, entryBeat }), RangeError);
    assert.deepEqual(audio.musicState, before, 'an invalid entrance cannot change the active cue');
  }
  audio.setTrack(premiere.track!);
  assert.equal(audio.musicState.entryBeat, 0); assert.equal(audio.musicState.requestedEntryBeat, 0, 'the music library plays complete songs');
});

test('betrayal, intimate rain, public repair and consensual confession have separate intended music', () => {
  const cue = (chapter: number, phase: 'intro' | 'victory', line: number) => resolveCutsceneCue(chapter, phase, line, resolveStoryShot(CHAPTERS[chapter]![phase], line));
  assert.equal(MUSIC_LIBRARY[cue(4, 'intro', 6).track!]!.file, 'one-umbrella-two-chairs');
  assert.equal(MUSIC_LIBRARY[cue(6, 'victory', 3).track!]!.file, 'dead-air-confession');
  assert.equal(cue(6, 'victory', 3).mood, 'tense');
  assert.equal(cue(6, 'victory', 6).mood, 'grief');
  assert.equal(MUSIC_LIBRARY[cue(7, 'intro', 2).track!]!.file, 'borrowed-power-waltz');
  assert.equal(MUSIC_LIBRARY[cue(11, 'victory', 3).track!]!.file, 'jun-the-first-light');
  assert.equal(MUSIC_LIBRARY[cue(11, 'victory', 7).track!]!.file, 'side-b-press-record');
  assert.equal(cue(11, 'victory', 7).mood, 'tender');
  assert.notEqual(cue(4, 'victory', 4).track, cue(4, 'victory', 5).track, 'the threatening phone call interrupts the romance');
});

test('the score cuts on interruptions, swells into intimacy and falls silent where the story does', () => {
  const cue = (chapter: number, phase: 'intro' | 'victory', line: number) => resolveCutsceneCue(chapter, phase, line, resolveStoryShot(CHAPTERS[chapter]![phase], line));
  // Two a.m.: the broadcast power dies, the room is dead air, then the betrayal creeps in.
  assert.equal(cue(6, 'victory', 0).track, null); assert.equal(cue(6, 'victory', 0).transition, 'powerdown');
  assert.equal(cue(6, 'victory', 1).track, null);
  assert.equal(MUSIC_LIBRARY[cue(6, 'victory', 2).track!]!.file, 'dead-air-confession'); assert.equal(cue(6, 'victory', 2).transition, 'slow');
  assert.equal(cue(4, 'victory', 5).transition, 'cut', 'the sponsor’s call interrupts the umbrella scene');
  assert.equal(cue(9, 'intro', 8).transition, 'cut', 'returning the key is decisive');
  // Ren leaves silence after Jun's song; Aki speaks into it, and the love theme answers.
  assert.equal(cue(11, 'victory', 4).track, cue(11, 'victory', 3).track);
  assert.equal(cue(11, 'victory', 5).track, null); assert.equal(cue(11, 'victory', 5).transition, 'slow');
  assert.equal(MUSIC_LIBRARY[cue(11, 'victory', 6).track!]!.file, 'side-b-press-record'); assert.equal(cue(11, 'victory', 6).transition, 'slow');
  const audio = new GameAudio();
  audio.setCutsceneCue(cue(6, 'intro', 13)); const playing = audio.musicState;
  audio.setCutsceneCue(cue(6, 'victory', 0));
  assert.equal(audio.musicState.silent, true); assert.equal(audio.musicState.track, null);
  assert.equal(audio.musicState.transitions, playing.transitions + 1);
  audio.setCutsceneCue(cue(6, 'victory', 1));
  assert.equal(audio.musicState.silent, true); assert.equal(audio.musicState.transitions, playing.transitions + 1, 'a held silence changes nothing');
  audio.setCutsceneCue(cue(6, 'victory', 2));
  assert.equal(audio.musicState.silent, false); assert.equal(audio.musicState.file, 'dead-air-confession'); assert.equal(audio.musicState.transition, 'slow');
  audio.setCutsceneCue(cue(6, 'victory', 0)); audio.endCutscene();
  assert.equal(audio.musicState.silent, false, 'skipping out of a silence brings the last song back');
  assert.equal(audio.musicState.source, 'song');
});

test('audio transport holds on repeated dialogue, morphs on an angle and changes song on the deadline', () => {
  const audio = new GameAudio(), lines = CHAPTERS[0]!.intro;
  const cue = (line: number) => resolveCutsceneCue(0, 'intro', line, resolveStoryShot(lines, line));
  audio.setCutsceneCue(cue(0)); const start = audio.musicState;
  audio.setCutsceneCue(cue(0)); assert.deepEqual(audio.musicState, start);
  audio.setCutsceneCue(cue(1)); const angle = audio.musicState;
  assert.equal(angle.transitions, start.transitions); assert.equal(angle.startedAt, start.startedAt);
  assert.equal(angle.arrangementChanges, start.arrangementChanges + 1); assert.notDeepEqual(angle.stems, start.stems);
  audio.setCutsceneCue(cue(2)); assert.deepEqual(audio.musicState, angle);
  audio.setCutsceneCue(cue(3)); assert.equal(audio.musicState.transitions, start.transitions + 1);
  assert.notEqual(audio.musicState.title, start.title);
  audio.setCutsceneCue(cue(1)); assert.equal(audio.musicState.title, start.title, 'Back restores the authored cue');
  audio.setVolumes(.22, .63); audio.setExternalMusic(true); audio.setCutsceneCue(cue(3));
  assert.equal(audio.musicState.external, true); assert.equal(audio.musicState.audible, false); assert.equal(audio.musicState.volume, .22);
  audio.endCutscene(); assert.equal(audio.musicState.source, 'song'); assert.equal(audio.musicState.cue, null);
  audio.setTrack(1); assert.equal(audio.musicState.title, 'Harbor Signals'); assert.equal(audio.effectsVolume, .63);
  for (const chapter of CHAPTERS) assert.equal(resolveCutsceneCue(chapter.id, 'retry', 0, resolveStoryShot(RETRY_SCENE, 0)).track, 19);
});
