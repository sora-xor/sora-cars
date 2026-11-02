import test from 'node:test';
import assert from 'node:assert/strict';
import { planStreetSoundtrack, streetSongPosition, type StreetSoundtrackClock } from '../src/game/street/soundtrack-clock';

const playing: StreetSoundtrackClock = {
  tick: 300, durationSeconds: 180, currentTime: 10, mediaDuration: 181,
  readyState: 4, seeking: false, ended: false, paused: false, active: true, enabled: true,
};
const plan = (changes: Partial<StreetSoundtrackClock> = {}) => planStreetSoundtrack({ ...playing, ...changes });

test('recorded music follows tick/30 with bounded drift and no playback-rate correction', () => {
  assert.deepEqual(plan(), { expectedSeconds: 10, shouldPlay: true, seekTo: null });
  assert.deepEqual(plan({ tick: 301, currentTime: 301 / 30 }), {
    expectedSeconds: 301 / 30, shouldPlay: true, seekTo: null,
  });
  assert.equal(plan({ currentTime: 10.5 }).seekTo, null);
  assert.deepEqual(plan({ currentTime: 10.51 }), { expectedSeconds: 10, shouldPlay: false, seekTo: 10 });
  assert.equal(plan({ currentTime: 9.49 }).seekTo, 10);
  assert.deepEqual(Object.keys(plan()).sort(), ['expectedSeconds', 'seekTo', 'shouldPlay']);
});

test('pause and mute stop playback, then resume at the simulation position', () => {
  for (const off of [{ active: false }, { enabled: false }]) {
    assert.deepEqual(plan({ ...off, tick: 600, paused: true }), {
      expectedSeconds: 20, shouldPlay: false, seekTo: null,
    });
  }
  assert.deepEqual(plan({ tick: 600, paused: true }), {
    expectedSeconds: 20, shouldPlay: false, seekTo: 20,
  });
  assert.deepEqual(plan({ tick: 600, currentTime: 20, paused: true }), {
    expectedSeconds: 20, shouldPlay: true, seekTo: null,
  });
  assert.equal(plan({ currentTime: 10.09, paused: true }).seekTo, null);
  assert.equal(plan({ currentTime: 10.11, paused: true }).seekTo, 10);
});

test('backward replay seeks and stalled simulation are synchronized without advancing ticks', () => {
  const clock = Object.freeze({ ...playing, tick: 90, currentTime: 40 });
  assert.deepEqual(planStreetSoundtrack(clock), { expectedSeconds: 3, shouldPlay: false, seekTo: 3 });
  assert.equal(clock.tick, 90);
  assert.equal(clock.currentTime, 40);
  assert.equal(plan({ tick: 90, currentTime: 3, seeking: true }).shouldPlay, false);
  assert.equal(plan({ tick: 90, currentTime: 3, paused: true }).shouldPlay, true);
  // The game clock can stall while the audio clock runs: resync, never speed up physics/music.
  assert.equal(plan({ currentTime: 10.49 }).seekTo, null);
  assert.equal(plan({ currentTime: 10.51 }).seekTo, 10);
});

test('metadata and an in-flight seek gate both seeking and playback', () => {
  for (const readyState of [0, -1, 1.5, 5, NaN, Infinity]) {
    assert.deepEqual(plan({ readyState, currentTime: 0, mediaDuration: NaN }), {
      expectedSeconds: 10, shouldPlay: false, seekTo: null,
    });
  }
  for (const mediaDuration of [NaN, Infinity, -1]) {
    assert.deepEqual(plan({ readyState: 1, mediaDuration }), {
      expectedSeconds: 10, shouldPlay: false, seekTo: null,
    });
  }
  assert.deepEqual(plan({ readyState: 0, mediaDuration: 0 }), {
    expectedSeconds: 10, shouldPlay: false, seekTo: null,
  });
  assert.deepEqual(plan({ readyState: 1, currentTime: 0 }), {
    expectedSeconds: 10, shouldPlay: false, seekTo: 10,
  });
  assert.deepEqual(plan({ currentTime: 0, seeking: true }), {
    expectedSeconds: 10, shouldPlay: false, seekTo: null,
  });
});

test('while the player races, the song plays from the top again at its authored end', () => {
  const ended = { ended: true, paused: true, currentTime: 180 };
  assert.deepEqual(plan({ tick: 5399, ...ended }), { expectedSeconds: 5399 / 30, shouldPlay: false, seekTo: null });
  // Media that outran the clock waits for it; the clock's new pass rewinds it without an explicit event.
  assert.deepEqual(plan({ tick: 5390, ...ended }), { expectedSeconds: 5390 / 30, shouldPlay: false, seekTo: null });
  assert.deepEqual(plan({ tick: 5400, ...ended }), { expectedSeconds: 0, shouldPlay: false, seekTo: 0 });
  assert.equal(plan({ tick: 5412, ...ended }).seekTo, 5412 / 30 - 180);
  // After a stalled frame only the player's explicit restart event rewinds it.
  assert.equal(plan({ tick: 5418, ...ended }).seekTo, null);
  assert.equal(plan({ tick: 5418, ...ended, resyncEnded: true }).seekTo, 5418 / 30 - 180);
  // Media still in the silent tail is moved to the clock's new pass.
  assert.deepEqual(plan({ tick: 5406, currentTime: 179.9 }), {
    expectedSeconds: 5406 / 30 - 180, shouldPlay: false, seekTo: 5406 / 30 - 180,
  });
  assert.deepEqual(plan({ tick: 6000, currentTime: 20 }), { expectedSeconds: 20, shouldPlay: true, seekTo: null });
  assert.deepEqual(plan({ tick: 11400, currentTime: 20 }), { expectedSeconds: 20, shouldPlay: true, seekTo: null });
  assert.deepEqual(streetSongPosition({ ...playing, tick: 11400 }), { seconds: 20, start: 0, pass: 2 });
  assert.equal(plan({ tick: 0, currentTime: 0, durationSeconds: 0.03 }).shouldPlay, true);
});

test('a decoded file shorter or longer than the authored song never plays beyond either end', () => {
  assert.deepEqual(plan({ tick: 3000, mediaDuration: 80 }), {
    expectedSeconds: 80, shouldPlay: false, seekTo: null,
  });
  assert.equal(plan({ tick: 3000, mediaDuration: 80, currentTime: 80, ended: true, paused: true, resyncEnded: true }).seekTo, null);
  assert.equal(plan({ tick: 5406, mediaDuration: 80, currentTime: 80, ended: true, paused: true }).seekTo, 5406 / 30 - 180);
  assert.deepEqual(plan({ tick: 5399, mediaDuration: 250, currentTime: 179.97 }), {
    expectedSeconds: 5399 / 30, shouldPlay: false, seekTo: null,
  });
  assert.deepEqual(plan({ tick: 5400, mediaDuration: 250, currentTime: 179.97, paused: true }), {
    expectedSeconds: 0, shouldPlay: false, seekTo: 0,
  });
});

test('once the player\'s race ends, the phrase finishes, the song\'s own ending plays once, and nothing loops', () => {
  const ending = { codaSeconds: 160, phraseSeconds: 8 };
  const after = (raceEndSeconds: number, changes: Partial<StreetSoundtrackClock>) => plan({ ending, raceEndSeconds, ...changes });
  // A race ending at 100.5 s finishes the phrase up to 104 s, then jumps to the coda at 160 s.
  assert.deepEqual(after(100.5, { tick: 3090, currentTime: 103 }), { expectedSeconds: 103, shouldPlay: true, seekTo: null });
  assert.deepEqual(after(100.5, { tick: 3150, currentTime: 105 }), { expectedSeconds: 161, shouldPlay: false, seekTo: 161 });
  assert.deepEqual(after(100.5, { tick: 3570, currentTime: 175 }), { expectedSeconds: 175, shouldPlay: true, seekTo: null });
  for (const tick of [3780, 5430, 9000, 12000]) {
    for (const media of [{ currentTime: 180, ended: true, paused: true, resyncEnded: true }, { currentTime: 3 }]) {
      assert.deepEqual(after(100.5, { tick, ...media }), { expectedSeconds: 180, shouldPlay: false, seekTo: null });
    }
  }
  // On a phrase boundary it jumps at once; in the last phrase it plays straight into the coda.
  assert.equal(after(104, { tick: 3150 }).seekTo, 161);
  assert.deepEqual(after(155, { tick: 4830, currentTime: 161 }), { expectedSeconds: 161, shouldPlay: true, seekTo: null });
  // In a later pass the phrase grid is the same; the coda is a new pass that rewinds an ended file.
  assert.deepEqual(after(190.5, { tick: 5850, currentTime: 15 }), { expectedSeconds: 15, shouldPlay: true, seekTo: null });
  assert.deepEqual(after(190.5, { tick: 5910, currentTime: 16 }), { expectedSeconds: 161, shouldPlay: false, seekTo: 161 });
  assert.deepEqual(streetSongPosition({ ...playing, ending, raceEndSeconds: 190.5, tick: 5910 }), { seconds: 161, start: 160, pass: 2 });
  assert.equal(after(190, { tick: 5880, currentTime: 180, ended: true, paused: true }).seekTo, 160);
  assert.equal(after(190, { tick: 5910, currentTime: 180, ended: true, paused: true }).seekTo, null);
  // A race that ends inside the song's own ending lets it play out, then stays silent.
  assert.deepEqual(after(165, { tick: 5100, currentTime: 170 }), { expectedSeconds: 170, shouldPlay: true, seekTo: null });
  assert.deepEqual(after(165, { tick: 5430, currentTime: 180, ended: true, paused: true }), {
    expectedSeconds: 180, shouldPlay: false, seekTo: null,
  });
  // The coda plays on over the results: time after the simulation stops counts like ticks.
  assert.deepEqual(after(100.5, { tick: 3015, afterSeconds: 4.5, currentTime: 105 }), after(100.5, { tick: 3150, currentTime: 105 }));
  // Without a known ending, the current play finishes and the song does not restart.
  assert.deepEqual(plan({ raceEndSeconds: 100.5, tick: 3150, currentTime: 105 }), { expectedSeconds: 105, shouldPlay: true, seekTo: null });
  assert.deepEqual(plan({ raceEndSeconds: 100.5, tick: 5430, currentTime: 1 }), { expectedSeconds: 180, shouldPlay: false, seekTo: null });
});

test('replay seeks into later passes and the coda land on the same note', () => {
  const seek = { currentTime: 3, paused: true, resyncEnded: true };
  assert.deepEqual(plan({ tick: 6000, ...seek }), { expectedSeconds: 20, shouldPlay: false, seekTo: 20 });
  assert.deepEqual(plan({ tick: 6000, currentTime: 20, paused: true }), { expectedSeconds: 20, shouldPlay: true, seekTo: null });
  const ending = { codaSeconds: 160, phraseSeconds: 8 };
  assert.deepEqual(plan({ tick: 5910, ending, raceEndSeconds: 190, ...seek }), { expectedSeconds: 161, shouldPlay: false, seekTo: 161 });
  assert.deepEqual(plan({ tick: 5850, ending, raceEndSeconds: 190, ...seek }), { expectedSeconds: 15, shouldPlay: false, seekTo: 15 });
  // Tick by tick the song advances 1/30 s, and jumps only to the top of a new pass or the coda.
  let previous = streetSongPosition({ ...playing, tick: 0, ending });
  for (let tick = 1; tick <= 12000; tick++) {
    const position = streetSongPosition({ ...playing, tick, ending, raceEndSeconds: tick >= 5700 ? 190 : null });
    if (position.pass === previous.pass) assert.ok(Math.abs(position.seconds - previous.seconds - 1 / 30) < 1e-9, `tick ${tick} advances`);
    else assert.ok(position.pass === previous.pass + 1 && position.seconds - position.start < 1 / 30 + 1e-9, `tick ${tick} begins a pass`);
    previous = position;
  }
  assert.equal(previous.pass, 2);
});

test('malformed race ends, results time and endings are ignored safely', () => {
  for (const raceEndSeconds of [NaN, Infinity, -Infinity, -1, 400]) {
    assert.deepEqual(plan({ tick: 5430, currentTime: 1, raceEndSeconds }), { expectedSeconds: 1, shouldPlay: true, seekTo: null });
  }
  for (const afterSeconds of [NaN, Infinity, -Infinity, -5]) {
    assert.deepEqual(plan({ afterSeconds }), { expectedSeconds: 10, shouldPlay: true, seekTo: null });
  }
  for (const ending of [{ codaSeconds: NaN, phraseSeconds: 8 }, { codaSeconds: 180, phraseSeconds: 8 }, { codaSeconds: -1, phraseSeconds: 8 },
    { codaSeconds: 160, phraseSeconds: 0 }, { codaSeconds: 160, phraseSeconds: NaN }, { codaSeconds: 160, phraseSeconds: Infinity }]) {
    assert.deepEqual(plan({ ending, raceEndSeconds: 100.5, tick: 3150, currentTime: 105 }), { expectedSeconds: 105, shouldPlay: true, seekTo: null });
  }
  for (const tick of [NaN, Infinity]) assert.deepEqual(streetSongPosition({ ...playing, tick }), { seconds: 0, start: 0, pass: 0 });
  const huge = plan({ tick: Number.MAX_VALUE, ended: true, paused: true, resyncEnded: true });
  assert.ok(huge.expectedSeconds >= 0 && huge.expectedSeconds <= 180 && (huge.seekTo === null || Number.isFinite(huge.seekTo)));
});

test('premature media end requires an explicit replay/resume event before rewinding', () => {
  const ended = { tick: 3000, currentTime: 181, ended: true, paused: true };
  assert.deepEqual(plan(ended), { expectedSeconds: 100, shouldPlay: false, seekTo: null });
  assert.deepEqual(plan({ ...ended, resyncEnded: true }), {
    expectedSeconds: 100, shouldPlay: false, seekTo: 100,
  });
  assert.equal(plan({ ...ended, resyncEnded: true, seeking: true }).seekTo, null);
  assert.equal(plan({ ...ended, resyncEnded: true, readyState: 0 }).seekTo, null);
  assert.equal(plan({ ...ended, resyncEnded: true, enabled: false }).seekTo, null);
  assert.deepEqual(plan({ ...ended, currentTime: 100, ended: false }), {
    expectedSeconds: 100, shouldPlay: true, seekTo: null,
  });
  // Explicit restart just outside the end epsilon must seek even inside resume tolerance.
  assert.deepEqual(plan({ tick: 299, durationSeconds: 10.04, mediaDuration: 10.04,
    currentTime: 10.04, ended: true, paused: true, resyncEnded: true }), {
    expectedSeconds: 299 / 30, shouldPlay: false, seekTo: 299 / 30,
  });
});

test('malformed clocks stop safely and malformed media times produce only finite seeks', () => {
  for (const tick of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(plan({ tick }), { expectedSeconds: 0, shouldPlay: false, seekTo: null });
  }
  for (const durationSeconds of [0, -1, NaN, Infinity, -Infinity]) {
    assert.deepEqual(plan({ durationSeconds }), { expectedSeconds: 0, shouldPlay: false, seekTo: null });
  }
  assert.deepEqual(plan({ mediaDuration: 0 }), { expectedSeconds: 0, shouldPlay: false, seekTo: null });
  assert.deepEqual(plan({ tick: -30, currentTime: 0 }), { expectedSeconds: 0, shouldPlay: true, seekTo: null });
  for (const currentTime of [NaN, Infinity, -Infinity, -1]) {
    assert.deepEqual(plan({ currentTime }), { expectedSeconds: 10, shouldPlay: false, seekTo: 10 });
  }
});
