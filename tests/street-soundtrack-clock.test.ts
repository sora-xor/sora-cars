import test from 'node:test';
import assert from 'node:assert/strict';
import { planStreetSoundtrack, type StreetSoundtrackClock } from '../src/game/street/soundtrack-clock';

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

test('authored completion and decoded file completion never loop or seek beyond the end', () => {
  for (const tick of [5399, 5400, 9000, Number.MAX_VALUE]) {
    const result = plan({ tick, ended: true, paused: true, resyncEnded: true });
    assert.equal(result.shouldPlay, false);
    assert.equal(result.seekTo, null);
    assert.ok(result.expectedSeconds <= 180);
  }
  assert.deepEqual(plan({ tick: 3000, mediaDuration: 80 }), {
    expectedSeconds: 80, shouldPlay: false, seekTo: null,
  });
  assert.deepEqual(plan({ tick: 5400, mediaDuration: 250 }), {
    expectedSeconds: 180, shouldPlay: false, seekTo: null,
  });
  assert.equal(plan({ tick: 0, currentTime: 0, durationSeconds: 0.03 }).shouldPlay, true);
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
