import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STREET_ROUTES } from '../src/game/street/assets';
import { STREET_ROUTE_SONGS, streetSongSectionsMs } from '../src/game/street/route-songs';
import { STREET_SONG_ENDINGS } from '../src/game/street/song-endings';

test('every street route knows where its song\'s own final eight bars begin', () => {
  for (const route of STREET_ROUTES) {
    const ending = STREET_SONG_ENDINGS[route.id];
    assert.ok(ending, route.id);
    assert.ok(ending.codaSeconds > route.musicDurationSeconds / 2, route.id);
    assert.ok(ending.codaSeconds + 2 * ending.phraseSeconds < route.musicDurationSeconds, route.id);
  }
});

test('a composed song\'s coda is its final section, on the phrase grid of its authored chapter cues', () => {
  for (const song of STREET_ROUTE_SONGS) {
    const ending = STREET_SONG_ENDINGS[song.route]!, route = STREET_ROUTES.find(item => item.id === song.route)!;
    assert.ok(Math.abs(ending.codaSeconds * 1000 - streetSongSectionsMs(song, 0.08).at(-1)!) <= 0.5, song.route);
    assert.ok(Math.abs(ending.phraseSeconds * 2 * song.sections - song.seconds) < 1e-9, song.route);
    // Each render adds the 0.08 s lead-in and a one-second release tail to the score.
    assert.ok(Math.abs(route.musicDurationSeconds - (0.08 + song.seconds + 1)) < 1e-6, song.route);
    const authored = JSON.parse(readFileSync(new URL(`../world/authoring/${song.route}.json`, import.meta.url), 'utf8'));
    // The first cue is the start line; the rest are section starts.
    for (const cue of (authored.sound.cuesMs as number[]).slice(1)) {
      const phrases = (ending.codaSeconds - cue / 1000) / ending.phraseSeconds;
      assert.ok(Math.abs(phrases - Math.round(phrases)) * ending.phraseSeconds < 0.001, `${song.route} cue ${cue}`);
    }
  }
});

test('Tokyo\'s coda is the supplied recording\'s last eight bars before the music stops', () => {
  const ending = STREET_SONG_ENDINGS['tokyo-1986']!;
  assert.ok(Math.abs(ending.phraseSeconds - 16 * 60 / 107.49) < 1e-9);
  assert.ok(Math.abs(ending.codaSeconds + 2 * ending.phraseSeconds - 252.945) < 0.01);
});
